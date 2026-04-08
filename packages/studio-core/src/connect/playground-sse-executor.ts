/**
 * Playground SSE executor — thin dispatcher.
 *
 * Two modes:
 *
 *  - `mode: "direct"` (default) — runs the endpoint in-process via the
 *    canonical `executeDirectSSE` pipeline (resolve → validate → middleware
 *    → handler → instrument). Studio events fire from the in-process
 *    instrumentation; they correlate to the externally-supplied requestId.
 *
 *  - `mode: "proxy"` — opens a real SSE connection to a deployed proxy
 *    endpoint via `createProxySSEFactory`. The target URL is resolved from
 *    the registered source's `options.proxyPath.sse` — there is no per-call
 *    URL input. The browser side does NOT wrap with `instrumentSSE` (per
 *    `proxy/sse.ts` design): the canonical Studio timeline entry is produced
 *    by the *server-side* `createSSEHandler` of the user's running app, which
 *    forwards via its own studio hooks. The playground simply opens, drains,
 *    and forwards lifecycle errors.
 *
 * Both branches honor the external `signal` for clean cancellation.
 */

import {
  abortPlayground,
  ConfigurationError,
  createProxySSEFactory,
  type ProxyPath,
  studioHooks,
} from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
import { executeDirectSSE } from "@noverax/nexus/internal-streams";

import { getAppOriginParsed } from "./app-origin";
import { narrowVariables, type StreamPayload } from "./playground-stream";

/** Test-injectable dependencies (production code uses defaults). */
export interface SSEExecutorDeps {
  /** Override the proxy SSE factory creator (default: canonical core). */
  createProxySSEFactory?: typeof createProxySSEFactory;
}

/** Drive a playground SSE stream end-to-end (direct or proxy). */
export async function executeSSEStream(
  sources: Sources,
  payload: StreamPayload,
  requestId: string,
  signal: AbortSignal,
  deps: SSEExecutorDeps = {},
): Promise<void> {
  if (signal.aborted) {
    studioHooks.onStreamError?.({
      requestId,
      error: "Stream cancelled before start",
      timestamp: Date.now(),
    });
    return;
  }

  if (payload.mode === "proxy") {
    return executeProxySSE(sources, payload, requestId, signal, deps);
  }
  return executeInProcessSSE(sources, payload, requestId, signal);
}

// ── Direct (in-process canonical pipeline) ──────────────────────────────────

async function executeInProcessSSE(
  sources: Sources,
  payload: StreamPayload,
  requestId: string,
  signal: AbortSignal,
): Promise<void> {
  let subscription: Awaited<ReturnType<typeof executeDirectSSE>>;
  try {
    subscription = await executeDirectSSE(
      sources,
      {
        source: payload.source,
        group: payload.group,
        method: payload.method,
        variables: narrowVariables(payload.variables),
        headers: payload.headers,
      },
      { signal, requestId },
    );
  } catch (err) {
    studioHooks.onStreamError?.({
      requestId,
      error: err instanceof Error ? err.message : "Stream failed",
      timestamp: Date.now(),
    });
    return;
  }

  // External cancel must produce `reason: "disconnect"`. Calling
  // subscription.close() from the abort listener marks the instrumentation
  // as closed first, so the later natural-completion emit is short-circuited.
  const onAbort = (): void => subscription.close();
  if (signal.aborted) subscription.close();
  else signal.addEventListener("abort", onAbort, { once: true });

  try {
    for await (const _event of subscription) {
      // Drain — events flow through studio hooks via instrumentSSE.
    }
  } catch {
    // Already reported via instrumentSSE.
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

// ── Proxy (real network connection) ─────────────────────────────────────────

async function executeProxySSE(
  sources: Sources,
  payload: StreamPayload,
  requestId: string,
  signal: AbortSignal,
  deps: SSEExecutorDeps,
): Promise<void> {
  // Resolve appOrigin BEFORE constructing the factory so the user sees a
  // clean APP_ORIGIN_NOT_CONFIGURED error instead of a deep connection
  // failure with no context. The factory itself accepts undefined origin,
  // so we only catch this here in the executor branch where we know we
  // need it (Node, no globalThis.location).
  let origin: ReturnType<typeof getAppOriginParsed>;
  try {
    origin = getAppOriginParsed();
  } catch (err) {
    studioHooks.onStreamError?.({
      requestId,
      error: formatProxyError(err, "SSE"),
      timestamp: Date.now(),
    });
    return;
  }

  const proxyPath = readSourceProxyPath(sources, payload.source);
  const factoryCreator = deps.createProxySSEFactory ?? createProxySSEFactory;
  let subscription: ReturnType<ReturnType<typeof createProxySSEFactory>>;
  try {
    const factory = factoryCreator(payload.source, { proxyPath, origin });
    // Forward the playground requestId via a custom header so the server-side
    // `createSSEHandler` can use it as its own requestId — that's how the
    // events emitted by `instrumentSSE` get correlated back to this exact
    // playground Subscribe. Without this header the server generates a fresh
    // requestId and the playground tab silently sees no events.
    subscription = factory(payload.group, payload.method, narrowVariables(payload.variables), {
      headers: {
        ...(payload.headers ?? {}),
        "x-nexus-playground-rid": requestId,
      },
    });
  } catch (err) {
    studioHooks.onStreamError?.({
      requestId,
      error: formatProxyError(err, "SSE"),
      timestamp: Date.now(),
    });
    return;
  }

  // Cancel chain (must run in this order):
  //  1. `subscription.close()` — aborts the executor's own SSE fetch loop
  //     and unblocks the local `for await` drain so this function can exit
  //     and clean up `activeStreams`.
  //  2. `abortPlayground(requestId)` — calls the in-process abort callback
  //     registered by the server-side `createSSEHandler` (when this is a
  //     same-process loopback) so the SSE generator stops yielding.
  //     Without this, Node loopback fetch abort doesn't synchronously
  //     propagate to `request.signal`, so the server keeps yielding and
  //     `studioHooks.onStreamMessage` keeps firing — the user clicks
  //     Unsubscribe and events keep streaming forever. Returns false (no-op)
  //     when executor and handler are in different processes.
  const onAbort = (): void => {
    subscription.close();
    abortPlayground(requestId);
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });

  // Watchdog for connect failures: the SSE connection loop catches
  // network errors and silently retries. The first connecting → reconnecting
  // transition (without ever reaching `connected`) means the very first
  // fetch attempt failed — typically because the resolved URL is unreachable
  // from the user-app process. We surface this as onStreamError instead of
  // letting the playground UI hang in CONNECTING forever.
  let everConnected = false;
  let watchdogReported = false;
  const unsubscribeStatus = subscription.on("status", (status) => {
    if (status === "connected") {
      everConnected = true;
      return;
    }
    if (status === "reconnecting" && !everConnected && !watchdogReported) {
      watchdogReported = true;
      studioHooks.onStreamError?.({
        requestId,
        error:
          "Proxy SSE connection failed before any successful response. Check that proxyPath.sse is reachable from the user-app process and that the route is mounted.",
        timestamp: Date.now(),
      });
      subscription.close();
    }
  });

  try {
    for await (const _event of subscription) {
      // Drain — server-side createSSEHandler emits stream:* events through
      // its own studio hooks, which flow back to the studio UI via the
      // user-app's bus. The playground side intentionally does not emit.
    }
  } catch (err) {
    // Network / parse failure on the proxy connection. Surface as a single
    // stream error since no Studio entry was opened on the playground side.
    studioHooks.onStreamError?.({
      requestId,
      error: err instanceof Error ? err.message : "Proxy SSE connection failed",
      timestamp: Date.now(),
    });
  } finally {
    unsubscribeStatus();
    signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Pull `options.proxyPath` from a registered source by name. Returns
 * `undefined` if the source is missing or has no embedded proxy metadata —
 * `resolveProxyPath` will then apply built-in defaults / throw.
 */
function readSourceProxyPath(sources: Sources, sourceName: string): ProxyPath | undefined {
  const src = sources[sourceName] as { options?: { proxyPath?: ProxyPath } } | undefined;
  return src?.options?.proxyPath;
}

/**
 * Surface configuration errors with a hint when the playground UI is
 * showing the user a missing-config state. Generic errors pass through.
 */
function formatProxyError(err: unknown, transport: "SSE" | "WS"): string {
  if (err instanceof ConfigurationError) {
    return `${transport} proxy not configured: ${err.message}`;
  }
  return err instanceof Error ? err.message : `Proxy ${transport} factory failed`;
}
