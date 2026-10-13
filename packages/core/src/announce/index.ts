/**
 * Adapter capability announcement buffer.
 *
 * Lives in core (zero runtime deps) so any framework adapter — `apiRoute`,
 * `sseRoute`, `createCourierServer`, `courierHonoHandler`, … — can call
 * `announceHosting()` without depending on `studio-core`.
 *
 * The buffer is pinned to a `globalThis` Symbol so module duplication caused
 * by webpack/Turbopack/Vite HMR does not split announcements across multiple
 * buffers. The consumer side (`studio-core/runtime/attach-runtime`) reads from
 * the same buffer through `consumeAnnouncements()`.
 */

import { discoverAppOrigin, getAppOrigin } from "../app-origin";
import type { AnySource } from "../define";
import type { Sources } from "../define/types";
import { getSources, onSourcesChange } from "../sources";

/** Transports a runtime claims it can serve for the listed sources */
export type RuntimeTransport = "http" | "sse" | "ws";

/** Adapter-side payload describing what an adapter is hosting */
export interface AnnounceHostingInput {
  /** Transports the adapter exposes — e.g. `["http", "sse"]` for Next.js App Router */
  transports: ReadonlyArray<RuntimeTransport>;
  /** Sources the adapter has registered for these transports */
  sources: ReadonlyArray<AnySource>;
  /**
   * Canonical HTTP(S) origin the runtime listens on (e.g. `http://localhost:3000`).
   * Standalone server adapters know this from their `.listen()` config; framework
   * adapters may omit it when the host runtime owns the listener (e.g. Next.js).
   */
  listenOrigin?: string;
  /**
   * Human-readable adapter id, e.g. `"next"`, `"hono"`, `"standalone"`. Used by
   * Studio for the runtime banner. Optional — falls back to `runtimeId` when
   * absent.
   */
  framework?: string;
}

/** Buffered announcement entry kept until the runtime handle drains it */
export interface BufferedAnnouncement {
  transports: ReadonlyArray<RuntimeTransport>;
  sources: ReadonlyArray<AnySource>;
  listenOrigin?: string;
  framework?: string;
  /** Wall-clock timestamp when the adapter called `announceHosting()` */
  at: number;
}

type Listener = (entry: BufferedAnnouncement) => void;

interface AnnounceState {
  buffer: BufferedAnnouncement[];
  listeners: Set<Listener>;
}

const ANNOUNCE_STATE_KEY = Symbol.for("courier.runtime.announce-state");
const g = globalThis as Record<symbol, unknown>;

if (!g[ANNOUNCE_STATE_KEY]) {
  g[ANNOUNCE_STATE_KEY] = { buffer: [], listeners: new Set<Listener>() } satisfies AnnounceState;
}

const state = g[ANNOUNCE_STATE_KEY] as AnnounceState;

/**
 * Adapter-internal API. Framework adapters (`apiRoute`, `sseRoute`,
 * `createCourierServer`, …) call this once they know which transports they
 * expose. Studio drains the buffer asynchronously via `consumeAnnouncements`
 * so the order of operations between adapter init and Studio attach does not
 * matter.
 */
export function announceHosting(input: AnnounceHostingInput): void {
  const entry: BufferedAnnouncement = {
    transports: input.transports,
    sources: input.sources,
    at: Date.now(),
    ...(input.listenOrigin !== undefined && { listenOrigin: input.listenOrigin }),
    ...(input.framework !== undefined && { framework: input.framework }),
  };
  state.buffer.push(entry);
  for (const listener of state.listeners) listener(entry);
}

/**
 * Announce what an adapter hosts as soon as sources are registered, without
 * requiring them when the adapter's handler is created.
 *
 * Call the returned function on each request, with the origin the request
 * was addressed to. It announces on the first call that finds the registry
 * populated, and once more when the app's origin is learned after that —
 * from a request, in development — so Studio shows where the app runs and
 * its Playground sends there; otherwise it does nothing. Before sources are
 * registered it does nothing and never throws, so a handler created at
 * module load works whenever `registerSources()` or `attachRuntime()` runs.
 * A request that arrives before any registration is answered by the
 * handler itself, which names the missing registry.
 *
 * Reading the registry once, as the factory ran, broke real setups: `next
 * build` evaluates every route module long before any `register()` hook, and
 * a Hono or Express app may mount its routes before awaiting
 * `attachRuntime()`. The adapter therefore announces as soon as sources are
 * registered — at once when they already are, or when they come — so Studio
 * knows which runtime serves them before the app has had a single request,
 * and the Playground can send to a freshly started app.
 *
 * @param input - What the adapter hosts, without the sources
 * @returns A function to call on each request, with the origin it was addressed to
 *
 * @example
 * ```ts
 * const announce = announceWhenRegistered({ transports: ["http"], framework: "hono" });
 * return (c) => {
 *   announce(new URL(c.req.raw.url).origin);
 *   return handle(c.req.raw);
 * };
 * ```
 */
export function announceWhenRegistered(
  input: Omit<AnnounceHostingInput, "sources">,
): (addressedTo?: string) => void {
  /* The origin the last announcement carried, or `null` before the first. */
  let announcedWith: string | undefined | null = null;
  let stopWaiting: (() => void) | undefined;
  const announce = (sources: Sources | undefined): void => {
    if (!sources) return;
    const origin = input.listenOrigin ?? getAppOrigin();
    if (announcedWith !== null && (announcedWith !== undefined || origin === undefined)) return;
    if (announcedWith === null) stopWaiting?.();
    announcedWith = origin;
    announceHosting({
      ...input,
      ...(origin !== undefined && { listenOrigin: origin }),
      sources: Object.values(sources),
    });
  };
  stopWaiting = onSourcesChange(announce);
  announce(getSources());
  return (addressedTo) => {
    discoverAppOrigin(addressedTo);
    announce(getSources());
  };
}

/**
 * Subscribe to announcements. Existing buffered entries are replayed
 * synchronously to the listener; future entries flow in via the listener.
 *
 * Returns an unsubscribe function. Used by `attachRuntime` to consume the
 * buffer once the `/runtime` socket is ready.
 */
export function consumeAnnouncements(listener: Listener): () => void {
  for (const entry of state.buffer) listener(entry);
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}
