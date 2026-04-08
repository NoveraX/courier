/**
 * Playground WS executor — thin dispatcher.
 *
 * Two modes:
 *
 *  - `mode: "direct"` (default) — runs the channel in-process via the
 *    canonical `executeDirectWSChannel` pipeline. The resulting `WSChannel`
 *    is registered in `playgroundChannelRegistry` so `playground:ws:send`
 *    socket events route to it. Studio events fire from `instrumentWSChannel`
 *    and correlate to the externally-supplied requestId.
 *
 *  - `mode: "proxy"` — opens a real WebSocket connection to a deployed proxy
 *    endpoint via `createProxyWSChannelFactory`. The target URL is resolved
 *    from the registered source's `options.proxyPath.ws` — there is no
 *    per-call URL input. The browser side does NOT wrap with
 *    `instrumentWSChannel` (per `proxy/ws.ts` design): the canonical Studio
 *    timeline entry comes from the *server-side* WS dispatcher in the user's
 *    running app.
 *
 * Both branches honor the external `signal` for clean cancellation.
 */

import {
  abortPlayground,
  ConfigurationError,
  createProxyWSChannelFactory,
  type ProxyPath,
  studioHooks,
} from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
import { executeDirectWSChannel } from "@noverax/nexus/internal-streams";
import type { WSChannel } from "@noverax/nexus/realtime";

import { getAppOriginParsed } from "./app-origin";
import { assertGlobalWebSocket } from "./node-websocket-guard";
import { narrowVariables, type StreamPayload } from "./playground-stream";
import { registerPlaygroundChannel, unregisterPlaygroundChannel } from "./playground-ws-send";

/** Test-injectable dependencies (production code uses defaults). */
export interface WSExecutorDeps {
  /** Override the proxy WS channel factory creator (default: canonical core). */
  createProxyWSChannelFactory?: typeof createProxyWSChannelFactory;
}

/** Drive a playground WS channel end-to-end (direct or proxy). */
export async function executeWSChannel(
  sources: Sources,
  payload: StreamPayload,
  requestId: string,
  signal: AbortSignal,
  deps: WSExecutorDeps = {},
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
    return executeProxyWS(sources, payload, requestId, signal, deps);
  }
  return executeInProcessWS(sources, payload, requestId, signal);
}

// ── Direct (in-process canonical pipeline) ──────────────────────────────────

async function executeInProcessWS(
  sources: Sources,
  payload: StreamPayload,
  requestId: string,
  signal: AbortSignal,
): Promise<void> {
  let channel: Awaited<ReturnType<typeof executeDirectWSChannel>>;
  try {
    // Important: do NOT pass `signal` to executeDirectWSChannel. Its internal
    // abort listener (state.close → setStatus("disconnected")) would race with
    // our own cleanup listener and emit `stream:close{reason:"complete"}`
    // before we can emit the user-initiated `"disconnect"` reason. We own
    // the lifecycle here and explicitly call `channel.close()` on cancel.
    channel = await executeDirectWSChannel(
      sources,
      {
        source: payload.source,
        group: payload.group,
        method: payload.method,
        variables: narrowVariables(payload.variables),
        headers: payload.headers,
      },
      { requestId },
    );
  } catch (err) {
    studioHooks.onStreamError?.({
      requestId,
      error: err instanceof Error ? err.message : "Channel start failed",
      timestamp: Date.now(),
    });
    return;
  }

  // try/finally guarantees the channel is unregistered and closed even if
  // the await Promise rejects unexpectedly (it shouldn't — the abort
  // listener only resolves — but defensive cleanup prevents registry leaks
  // across hard process failures or future refactor mistakes).
  registerPlaygroundChannel(requestId, channel);
  try {
    await new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
  } finally {
    channel.close();
    unregisterPlaygroundChannel(requestId);
  }
}

// ── Proxy (real network connection) ─────────────────────────────────────────

async function executeProxyWS(
  sources: Sources,
  payload: StreamPayload,
  requestId: string,
  signal: AbortSignal,
  deps: WSExecutorDeps,
): Promise<void> {
  // Runtime guard for Node <21: the underlying ws-connection module
  // calls `new WebSocket(url)` from the global, which is undefined on older
  // Node. Surface NODE_WEBSOCKET_UNAVAILABLE before constructing the factory
  // so the user sees actionable guidance instead of a ReferenceError.
  const wsGuardError = assertGlobalWebSocket();
  if (wsGuardError) {
    studioHooks.onStreamError?.({
      requestId,
      error: formatProxyError(wsGuardError),
      timestamp: Date.now(),
    });
    return;
  }

  // Resolve appOrigin BEFORE constructing the factory so the user sees a
  // clean APP_ORIGIN_NOT_CONFIGURED error instead of a deep connection
  // failure with no context. The factory itself accepts undefined origin
  // (browser-safe default), so we only catch this in the executor branch
  // where we know we need it (Node, no globalThis.location).
  let origin: ReturnType<typeof getAppOriginParsed>;
  try {
    origin = getAppOriginParsed();
  } catch (err) {
    studioHooks.onStreamError?.({
      requestId,
      error: formatProxyError(err),
      timestamp: Date.now(),
    });
    return;
  }

  const proxyPath = readSourceProxyPath(sources, payload.source);
  const factoryCreator = deps.createProxyWSChannelFactory ?? createProxyWSChannelFactory;
  let channel: WSChannel;
  try {
    // Pass `playgroundRequestId` so the factory appends `?_playground_rid=…`
    // to the WS URL. Server-side `ws-context.ts` extracts the query param
    // and uses it as the per-subscription Studio requestId, correlating
    // `stream:*` events back to this exact playground Subscribe.
    const factory = factoryCreator(payload.source, {
      proxyPath,
      origin,
      playgroundRequestId: requestId,
    });
    channel = factory(payload.group, payload.method, narrowVariables(payload.variables), {});
  } catch (err) {
    // Configuration / URL validation failure (missing proxyPath.ws, wrong
    // scheme, APP_ORIGIN_NOT_CONFIGURED for relative paths).
    studioHooks.onStreamError?.({
      requestId,
      error: formatProxyError(err),
      timestamp: Date.now(),
    });
    return;
  }

  // Register so playground:ws:send can deliver outbound messages.
  registerPlaygroundChannel(requestId, channel);

  // Watchdog for connect failures: a WS that never reaches `connected`
  // before transitioning to `reconnecting` means the very first upgrade
  // handshake failed — typically because the resolved URL is unreachable
  // from the user-app process. Surface as onStreamError instead of letting
  // the playground UI hang in CONNECTING forever.
  let everConnected = false;
  let watchdogReported = false;
  const unsubscribeStatus = channel.on("status", (status) => {
    if (status === "connected") {
      everConnected = true;
      return;
    }
    if (status === "reconnecting" && !everConnected && !watchdogReported) {
      watchdogReported = true;
      studioHooks.onStreamError?.({
        requestId,
        error:
          "Proxy WS connection failed before any successful upgrade. Check that proxyPath.ws is reachable from the user-app process and that the route is mounted.",
        timestamp: Date.now(),
      });
      channel.close();
    }
  });

  try {
    await new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
  } finally {
    unsubscribeStatus();
    channel.close();
    // Force-close the server-side WS connection via the in-process registry
    // (when same-process loopback). Browser `new WebSocket(url).close()`
    // sends a close frame but the server may still be in the middle of
    // yielding events for an active subscription, and Node WS abort doesn't
    // synchronously trigger the server's close listener. Calling
    // `abortPlayground` invokes the registered `ws.close()` directly on the
    // server-side socket so the close listener fires immediately and the
    // subscription tracker emits `stream:close{disconnect}` for the UI.
    // No-op when executor and handler are in different processes.
    abortPlayground(requestId);
    unregisterPlaygroundChannel(requestId);
  }
}

/**
 * Pull `options.proxyPath` from a registered source by name. Returns
 * `undefined` if the source is missing or has no embedded proxy metadata —
 * `resolveProxyPath` will then throw `WS_PATH_NOT_CONFIGURED`.
 */
function readSourceProxyPath(sources: Sources, sourceName: string): ProxyPath | undefined {
  const src = sources[sourceName] as { options?: { proxyPath?: ProxyPath } } | undefined;
  return src?.options?.proxyPath;
}

function formatProxyError(err: unknown): string {
  if (err instanceof ConfigurationError) {
    return `WS proxy not configured: ${err.message}`;
  }
  return err instanceof Error ? err.message : "Proxy WS factory failed";
}
