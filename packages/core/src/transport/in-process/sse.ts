import type { Sources } from "../../define/types";
import { eventsOf, sseEventOf } from "../../realtime/implementation";
import { streamLabel } from "../../realtime/stream-label";
import type { SSEContext, SSEEvent, SSESubscription } from "../../realtime/types";
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
  // In process there is no response to report: the headers shown in its
  // place are the ones the endpoint received after its middleware (auth
  // merged in, allowedHeaders whitelist applied, etc).
  instr?.updateMeta({ responseHeaders: headersToRecord(headers) });

  const label = streamLabel(payload);
  const events = abortableEvents(
    sseEvents(eventsOf(endpoint, sseCtx, label), label),
    composedSignal,
  );
  const subscription = wrapEventsAsSubscription(
    schema.response ? checkedEvents(events, schema.response) : events,
    ownAC,
  );
  return instrumentSSE(subscription, meta, instr);
}

/**
 * Wrap a handler's events as the minimal SSESubscription contract for
 * in-process use.
 *
 * Closing ends a reader waiting on the next event at once, even while the
 * handler is parked on an await; the handler hears it through `ctx.signal`.
 */
function wrapEventsAsSubscription(
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

async function* sseEvents(
  values: AsyncIterable<unknown>,
  label: string,
): AsyncGenerator<SSEEvent<unknown>, void, unknown> {
  for await (const value of values) yield sseEventOf(value, label);
}
