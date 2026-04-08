/**
 * Process-global registry mapping Studio Playground requestId → server-side
 * abort callback.
 *
 * # Why this exists
 *
 * In Studio Playground proxy mode, the playground executor runs inside the
 * user-app process and opens a *self-loopback* fetch (or WebSocket) to the
 * same process's `createSSEHandler` / WS handler. When the user clicks
 * Unsubscribe:
 *
 *  1. Executor calls `subscription.close()` which aborts the internal fetch
 *     `AbortController`
 *  2. In theory, the loopback TCP connection should close and the server-
 *     side `request.signal` should fire abort
 *  3. The server-side SSE generator's `while (!ctx.signal.aborted)` loop
 *     should exit, `cleanupSSEStream` should fire `onStreamClose`, and the
 *     UI should mark the entry complete
 *
 * In practice, **Node fetch loopback abort does not synchronously propagate
 * to the server-side `request.signal`**. The fetch `AbortController` is
 * marked aborted, the response stream consumer stops reading, but the
 * underlying TCP socket may take an arbitrary number of event loop ticks to
 * actually close — and during that window the server-side SSE handler keeps
 * yielding events that flow through `studioHooks.onStreamMessage` straight
 * to the UI. From the user's perspective: "I clicked Unsubscribe but events
 * keep coming forever".
 *
 * This registry side-steps the loopback issue by giving the executor a
 * **direct in-process handle** to the server-side handler's force-abort
 * callback. When `createSSEHandler` (or the WS context builder) sees a
 * `x-nexus-playground-rid` header / `_playground_rid` query param, it
 * registers its `forceAbort.abort` here keyed by the playground rid. On
 * cancel, the executor looks up the rid and calls the abort directly —
 * deterministic, no TCP dependency.
 *
 * # Cross-process behavior
 *
 * When executor and SSE handler live in **different processes** (e.g. the
 * user runs the standalone server separately and Studio Playground in the
 * Next.js process), the registry lookup returns `undefined` and the
 * executor falls back to TCP-based abort, which works fine across process
 * boundaries because there's a real network socket to close.
 *
 * # Storage
 *
 * Stored on `globalThis` via `Symbol.for` so it survives bundler module
 * duplication (Turbopack / webpack chunk boundaries) — same pattern as
 * `studioHooks` and the active connection.
 */

const REGISTRY_KEY = Symbol.for("nexus.studio.playground-abort-registry");
const g = globalThis as Record<symbol, unknown>;

if (!g[REGISTRY_KEY]) g[REGISTRY_KEY] = new Map<string, () => void>();
const registry = g[REGISTRY_KEY] as Map<string, () => void>;

/**
 * Register a server-side abort callback for a playground request.
 *
 * @param requestId - Studio Playground requestId (from header or query param)
 * @param abort - Callback that force-closes the server-side handler
 * @returns Unregister function — must be called from the handler's cleanup
 *   path so stale entries don't leak across reconnects
 */
export function registerPlaygroundAbort(requestId: string, abort: () => void): () => void {
  if (!requestId) return () => {};
  registry.set(requestId, abort);
  return () => {
    // Only remove if this is still our entry — prevents accidentally
    // unregistering a fresh handler that took over the same rid (shouldn't
    // happen with UUIDs, but defensive against future requestId schemes).
    if (registry.get(requestId) === abort) registry.delete(requestId);
  };
}

/**
 * Look up the abort callback for a playground request and invoke it.
 * Returns `true` when an in-process handler was found and aborted.
 * Returns `false` when there's no entry — caller should fall back to
 * TCP-based abort (which works for cross-process scenarios).
 */
export function abortPlayground(requestId: string): boolean {
  if (!requestId) return false;
  const abort = registry.get(requestId);
  if (!abort) return false;
  abort();
  return true;
}

/** Active registry size — exposed for testing only. */
export function playgroundAbortRegistrySize(): number {
  return registry.size;
}

/** Clear all entries — exposed for testing only. */
export function clearPlaygroundAbortRegistry(): void {
  registry.clear();
}
