/**
 * Playground stream handler — starts SSE/WS streams from Studio Playground.
 * Returns requestId immediately; events flow via studio hooks pipeline.
 */

import type { Sources } from "@noverax/nexus/define";
import { sharedPlaygroundWSRegistry } from "@noverax/nexus/internal-streams";

import { executeSSEStream } from "./playground-sse-executor";
import { executeWSChannel } from "./playground-ws-executor";

export interface StreamPayload {
  source: string;
  group: string;
  method: string;
  variables: unknown;
  transport: "sse" | "ws";
  /**
   * User-supplied request headers from the playground UI. Forwarded to the
   * canonical pipeline via `executeDirect{SSE,WSChannel}` so middleware sees
   * the same headers production code would see (auth tokens, etc).
   */
  headers?: Record<string, string>;
  /**
   * Execution mode (default `"direct"`):
   *  - `"direct"` — run the endpoint in-process via `executeDirect{SSE,WSChannel}`
   *  - `"proxy"`  — open a real network connection to a deployed proxy endpoint
   *    via `createProxy{SSE,WSChannel}Factory`. Resolves the target URL from
   *    the registered source's `options.proxyPath` — no per-payload URL.
   */
  mode?: "direct" | "proxy";
}

interface StreamStartResult {
  requestId: string;
  error?: string;
}

type StreamCallback = (result: StreamStartResult) => void;

/**
 * Active stream abort controllers keyed by requestId.
 *
 * Stored on `globalThis` via `Symbol.for` so it survives Turbopack / webpack
 * module duplication and HMR reloads. Without this, every Next.js code
 * change would create a fresh module instance with an empty Map, leaving
 * old controllers unreachable but their executors still alive — memory
 * grows linearly with reloads. Same pattern as `playgroundAbortRegistry`,
 * `studioHooks`, and `appOrigin`.
 */
const ACTIVE_STREAMS_KEY = Symbol.for("nexus.studio.playground-active-streams");
const g = globalThis as Record<symbol, unknown>;
if (!g[ACTIVE_STREAMS_KEY]) g[ACTIVE_STREAMS_KEY] = new Map<string, AbortController>();
const activeStreams = g[ACTIVE_STREAMS_KEY] as Map<string, AbortController>;

/** Start a playground stream — returns requestId, events flow via studio hooks */
export async function handlePlaygroundStream(
  sources: Sources | undefined,
  payload: StreamPayload,
  callback: StreamCallback,
): Promise<void> {
  if (!sources) {
    callback({ requestId: "", error: "No sources registered" });
    return;
  }

  const executor = payload.transport === "ws" ? executeWSChannel : executeSSEStream;
  const requestId = crypto.randomUUID();
  const ac = new AbortController();
  activeStreams.set(requestId, ac);

  // Return requestId immediately — stream events arrive via studio hooks
  callback({ requestId });

  // Execute in background — errors emitted via onStreamError
  await executor(sources, payload, requestId, ac.signal).finally(() => {
    activeStreams.delete(requestId);
  });
}

/** Cancel an active playground stream */
export function cancelPlaygroundStream(requestId: string): boolean {
  const ac = activeStreams.get(requestId);
  if (!ac) return false;
  ac.abort();
  activeStreams.delete(requestId);
  return true;
}

/**
 * Cancel every active playground stream and clear all in-process state.
 * Called on Studio socket disconnect — without this, AbortControllers,
 * channel registry entries, and broadcast subscriptions accumulate across
 * reconnect cycles in long-lived servers.
 *
 * Cleanup performed:
 *  1. abort() every AbortController in activeStreams (executors observe and
 *     unsubscribe via their finally / state.close paths)
 *  2. clear activeStreams Map
 *  3. clear sharedPlaygroundWSRegistry — belt-and-braces in case any
 *     channel was mid-onJoin and hadn't yet wired its abort listener
 *
 * Returns the number of streams that were cancelled.
 */
export function cancelAllPlaygroundStreams(): number {
  const count = activeStreams.size;
  for (const ac of activeStreams.values()) {
    ac.abort();
  }
  activeStreams.clear();
  sharedPlaygroundWSRegistry.clear();
  return count;
}

/** Number of active playground streams (for testing) */
export function activeStreamCount(): number {
  return activeStreams.size;
}

/**
 * Narrow an unknown payload field into a `Record<string, unknown>` if and
 * only if it is a non-array, non-null object. Anything else (number, string,
 * array, null, undefined) becomes `undefined`. Used by the SSE/WS executors
 * to keep socket payload trust-boundary safe.
 */
export function narrowVariables(value: unknown): Record<string, unknown> | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "object") return undefined;
  if (Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}
