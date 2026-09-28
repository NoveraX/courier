import type { Sources } from "../../define/types";
import type { SSEEvent, SSESubscription, WSContext, WSPushHandler } from "../../realtime/types";
import { qualifyTopic } from "../../realtime/ws/topic-key";
import { generateRequestId } from "../../studio";
import { abortableEvents } from "../../utils/abortable-events";
import { runTransportMiddleware } from "../../utils/transport-middleware";
import { beginStream, instrumentSSE } from "../instrument";
import {
  buildSyntheticRequest,
  checkedEvents,
  headersToRecord,
  resolveStreamEndpoint,
  validateStreamVariables,
} from "./shared";
import type { ExecuteDirectStreamOptions, ExecuteDirectWSPushPayload } from "./types";

const EXECUTOR = "executeDirectWSPush";

/**
 * Execute a WS push (server→client async generator) endpoint in-process.
 *
 * Reuses the canonical pipeline (resolve → validate variables → middleware
 * → handler → instrument). Returns an `SSESubscription`-shaped wrapper:
 * push endpoints are semantically equivalent to SSE on the client side and
 * Studio instrumentation goes through `instrumentSSE`.
 *
 * Throws on resolution failure or variables validation failure (mirroring
 * the canonical 4xx Response semantics, but as exceptions).
 */
export async function executeDirectWSPush(
  sources: Sources,
  payload: ExecuteDirectWSPushPayload,
  options: ExecuteDirectStreamOptions = {},
): Promise<SSESubscription> {
  const { endpoint, schema } = resolveStreamEndpoint(sources, payload, "ws", EXECUTOR);
  const variables = await validateStreamVariables(payload.variables, schema);

  const requestId = generateRequestId();
  const headers = await runTransportMiddleware({
    transport: "ws",
    sources,
    source: payload.source,
    group: payload.group,
    method: payload.method,
    variables,
    request: buildSyntheticRequest(payload.headers),
    requestId,
  });

  const ownAC = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) ownAC.abort();
    else options.signal.addEventListener("abort", () => ownAC.abort(), { once: true });
  }

  const baseTopic = `${payload.source}.${payload.group ? `${payload.group}.` : ""}${payload.method}`;
  const wsCtx: WSContext = {
    topic: qualifyTopic(baseTopic, variables),
    variables: variables ?? {},
    connectionId: crypto.randomUUID(),
    meta: {},
    signal: ownAC.signal,
  };

  const meta = {
    source: payload.source,
    group: payload.group,
    method: payload.method,
    transport: "ws" as const,
    mode: "direct" as const,
    requestHeaders: payload.headers ?? {},
  };
  const instr = beginStream(meta, options.requestId);
  instr?.updateMeta({ responseHeaders: headersToRecord(headers) });

  const handler = endpoint as WSPushHandler<unknown, unknown>;
  const events = liftToEvents(abortableEvents(handler(wsCtx), ownAC.signal));
  const subscription = wrapPushAsSubscription(
    schema.response ? checkedEvents(events, schema.response) : events,
    ownAC,
  );
  // Pass through `instrumentSSE` directly (push uses the same client shape).
  // The existing instr handle prevents double stream:open emission.
  return instrumentSSE(subscription, meta, instr);
}

/**
 * Wrap a push handler's values, lifted to events, as the minimal
 * SSESubscription contract.
 *
 * Closing ends a reader waiting on the next value at once, even while the
 * handler is parked on an await; the handler hears it through `ctx.signal`.
 */
function wrapPushAsSubscription(
  events: AsyncGenerator<SSEEvent<unknown>, void, unknown>,
  ownAC: AbortController,
): SSESubscription {
  return {
    [Symbol.asyncIterator]() {
      return events;
    },
    close() {
      ownAC.abort();
    },
    status: "connected",
    dropped: 0,
    on() {
      return () => {};
    },
  };
}

/** Push handlers yield bare values; the client reads `{ data }` as it does from SSE. */
async function* liftToEvents(values: AsyncIterable<unknown>): AsyncGenerator<SSEEvent<unknown>> {
  for await (const value of values) yield { data: value };
}
