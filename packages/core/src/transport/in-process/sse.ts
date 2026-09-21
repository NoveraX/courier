import type { Sources } from "../../define/types";
import type { SSEContext, SSEEvent, SSEHandler, SSESubscription } from "../../realtime/types";
import { generateRequestId } from "../../studio";
import { runTransportMiddleware } from "../../utils/transport-middleware";
import { beginStream, instrumentSSE } from "../instrument";
import {
  buildSyntheticRequest,
  headersToRecord,
  resolveStreamEndpoint,
  validateStreamVariables,
} from "./shared";
import type { ExecuteDirectSSEPayload, ExecuteDirectStreamOptions } from "./types";

const EXECUTOR = "executeDirectSSE";

/**
 * Execute an SSE endpoint in-process via the canonical pipeline.
 *
 * Resolves the endpoint, validates variables, runs middleware (with timeout),
 * builds a real `SSEContext` with merged headers, and returns a fully
 * Studio-instrumented `SSESubscription`. The result is wire-equivalent to a
 * direct production call — no fake headers, no skipped middleware, no fake
 * validation.
 *
 * Errors thrown:
 * - `Error` with `cause.status` when the endpoint cannot be resolved
 * - `ValidationError` when variables fail schema validation
 * - any error thrown by middleware
 *
 * Errors emitted by the endpoint generator after the stream has started
 * surface through the iterator and are reported to Studio via `instrumentSSE`
 * (`stream:error` + `stream:close{reason: "error"}`).
 *
 * **Limitations vs canonical SSE handler:**
 * - `Last-Event-ID` resume is NOT supported. The in-process executor is for
 *   ephemeral playground/test sessions where there is no client to reconnect.
 *   `SSEContext.lastEventId` is always `undefined`. Production reconnect
 *   semantics live on the canonical `createSSEHandler` server path.
 *
 * @example
 * const sub = await executeDirectSSE(sources, {
 *   source: "api", group: "chat", method: "feed",
 *   variables: { roomId: "42" },
 *   headers: { Authorization: "Bearer …" },
 * });
 * for await (const event of sub) console.log(event.data);
 */
export async function executeDirectSSE(
  sources: Sources,
  payload: ExecuteDirectSSEPayload,
  options: ExecuteDirectStreamOptions = {},
): Promise<SSESubscription> {
  const { endpoint, schema } = resolveStreamEndpoint(sources, payload, "sse", EXECUTOR);
  // Validate variables up front so the caller observes ValidationError before
  // any stream lifecycle begins (no half-opened Studio entries).
  const variables = await validateStreamVariables(payload.variables, schema);

  const requestId = generateRequestId();
  const headers = await runTransportMiddleware({
    transport: "sse",
    sources,
    source: payload.source,
    group: payload.group,
    method: payload.method,
    variables,
    request: buildSyntheticRequest(payload.headers),
    requestId,
  });

  // Compose external + internal abort: the external signal lets the caller
  // cancel from outside, while the internal AbortController lets `.close()`
  // cancel from inside the subscription wrapper. Cleanup is automatic via
  // AbortSignal.any once either source fires.
  const ownAC = new AbortController();
  // Mirror the explicit already-aborted check used in ws-push.ts: when the
  // caller passes a signal that fires before this point, abort eagerly so
  // the wrapped generator never starts iterating.
  if (options.signal?.aborted) ownAC.abort();
  const composedSignal = options.signal
    ? AbortSignal.any([options.signal, ownAC.signal])
    : ownAC.signal;

  const sseCtx: SSEContext = {
    variables: variables ?? {},
    signal: composedSignal,
    headers,
    lastEventId: undefined,
  };

  // Begin Studio instrumentation BEFORE invoking the handler so the timeline
  // entry exists even for handlers that throw synchronously on first .next().
  const meta = {
    source: payload.source,
    group: payload.group,
    method: payload.method,
    transport: "sse" as const,
    mode: "direct" as const,
    requestHeaders: payload.headers ?? {},
  };
  const instr = beginStream(meta, options.requestId);
  // Mirror canonical handle-sse: emit post-middleware effective headers as
  // responseHeaders so the playground UI shows what the endpoint actually
  // received (auth merged in, allowedHeaders whitelist applied, etc).
  instr?.updateMeta({ responseHeaders: headersToRecord(headers) });

  const sseHandler = endpoint as SSEHandler<unknown, unknown>;
  const generator = sseHandler(sseCtx);
  const subscription = wrapGeneratorAsSubscription(generator, ownAC);
  return instrumentSSE(subscription, meta, instr);
}

/** Wrap a generator as the minimal SSESubscription contract for in-process use. */
function wrapGeneratorAsSubscription(
  generator: AsyncGenerator<SSEEvent<unknown>, void, unknown>,
  ownAC: AbortController,
): SSESubscription {
  let closed = false;
  return {
    [Symbol.asyncIterator]() {
      return generator as AsyncIterableIterator<SSEEvent<unknown>>;
    },
    close() {
      if (closed) return;
      closed = true;
      ownAC.abort();
      // Best-effort: ask the generator to clean up. Errors are ignored —
      // they will surface through the iterator if a consumer is still reading.
      generator.return(undefined).catch(() => {});
    },
    status: "connected",
    dropped: 0,
    on() {
      return () => {};
    },
  };
}
