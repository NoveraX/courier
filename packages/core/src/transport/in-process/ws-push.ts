import type { Sources } from "../../define/types";
import type { SSEEvent, SSESubscription, WSContext, WSPushHandler } from "../../realtime/types";
import { qualifyTopic } from "../../realtime/ws/topic-hash";
import { generateRequestId } from "../../studio";
import { beginStream, instrumentSSE } from "../instrument";
import { runInProcessMiddleware } from "./middleware";
import {
  buildSyntheticRequest,
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
  const headers = await runInProcessMiddleware(
    "ws",
    sources,
    payload.source,
    payload.group,
    payload.method,
    variables,
    buildSyntheticRequest(payload.headers),
    requestId,
  );

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
  const subscription = wrapPushAsSubscription(handler(wsCtx), ownAC);
  // Pass through `instrumentSSE` directly (push uses the same client shape).
  // The existing instr handle prevents double stream:open emission.
  return instrumentSSE(subscription, meta, instr);
}

/** Wrap a raw push generator as the minimal SSESubscription contract. */
function wrapPushAsSubscription(
  generator: AsyncGenerator<unknown, void, unknown>,
  ownAC: AbortController,
): SSESubscription {
  let closed = false;
  // Push handlers yield raw values; lift them to SSEEvent shape so the
  // client iterator receives `{data}` consistently with SSE.
  const lifted = (async function* (): AsyncGenerator<SSEEvent<unknown>, void, unknown> {
    try {
      for await (const value of generator) {
        if (ownAC.signal.aborted) break;
        yield { data: value };
      }
    } finally {
      generator.return(undefined).catch(() => {});
    }
  })();

  return {
    [Symbol.asyncIterator]() {
      return lifted as AsyncIterableIterator<SSEEvent<unknown>>;
    },
    close() {
      if (closed) return;
      closed = true;
      ownAC.abort();
      lifted.return(undefined).catch(() => {});
    },
    status: "connected",
    dropped: 0,
    on() {
      return () => {};
    },
  };
}
