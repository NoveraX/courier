import type { Sources } from "../../define/types";
import { eventsOf } from "../../realtime/implementation";
import { streamLabel } from "../../realtime/stream-label";
import { SubscriptionHandle } from "../../realtime/subscription-handle";
import type { Subscription } from "../../realtime/subscription-types";
import type { SSEEvent, WSContext } from "../../realtime/types";
import { servedTopic } from "../../realtime/ws/served-topic";
import { generateRequestId } from "../../studio";
import { abortableEvents } from "../../utils/abortable-events";
import { ONCE } from "../../utils/own";
import { randomId } from "../../utils/random-id";
import { runTransportMiddleware } from "../../utils/transport-middleware";
import { beginStream, instrumentSSE } from "../instrument";
import { eventsDriver } from "./events-driver";
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
 * → handler → instrument). Returns a `Subscription`, as every kind returns:
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
): Promise<Subscription> {
  const { endpoint, schema, topicKey } = resolveStreamEndpoint(sources, payload, "push", EXECUTOR);
  const variables = await validateStreamVariables(payload.variables, schema);

  const requestId = generateRequestId();
  const { headers } = await runTransportMiddleware({
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
    else options.signal.addEventListener("abort", () => ownAC.abort(), ONCE);
  }

  const baseTopic = streamLabel(payload);
  const wsCtx: WSContext = {
    topic: servedTopic(baseTopic, variables, topicKey),
    variables: variables ?? {},
    connectionId: randomId(),
    meta: {},
    signal: ownAC.signal,
    recovered: false,
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

  const events = liftToEvents(abortableEvents(eventsOf(endpoint, wsCtx, baseTopic), ownAC.signal));
  const subscription = new SubscriptionHandle(
    eventsDriver(schema.response ? checkedEvents(events, schema.response) : events, ownAC),
  );
  // Pass through `instrumentSSE` directly (push uses the same client shape).
  // The existing instr handle prevents double stream:open emission.
  return instrumentSSE(subscription, meta, instr);
}

/** Push handlers yield bare values; the client reads `{ data }` as it does from SSE. */
async function* liftToEvents(values: AsyncIterable<unknown>): AsyncGenerator<SSEEvent<unknown>> {
  for await (const value of values) yield { data: value };
}
