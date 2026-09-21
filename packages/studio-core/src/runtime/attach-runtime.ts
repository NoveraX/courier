/**
 * `attachRuntime()` — the single public entry point for connecting any
 * Courier runtime process (browser bundle or server instrumentation) to a
 * Studio dev server.
 *
 * # Vision
 *
 * One function. Works on browser AND server. Auto-loads `courier.config.ts`
 * from disk on the server side. Wires `studioHooks` → EventBus → Studio
 * `/runtime` socket. Populates the global sources registry. Idempotent
 * per `runtimeId`.
 *
 * # Production-vs-dev split
 *
 * Some responsibilities run ALWAYS (production-relevant), others are
 * gated to dev only. The function makes the split internally so callers
 * never need their own `process.env.NODE_ENV` check.
 *
 *  - **ALWAYS**: load config + register sources + set `appOrigin` + wire
 *    `studioHooks.onSourceDefined` (so HMR-redefined sources reach the
 *    registry in production too).
 *
 *  - **DEV ONLY** (gated by `NODE_ENV !== "production"`): wire all the
 *    Studio observability hooks (request lifecycle, middleware, validation,
 *    stream, fetch, proxy, cache, dedup, upload), open the `/runtime`
 *    Socket.IO connection, install the playground responder.
 *
 * # User-facing usage
 *
 * Server side (Next.js instrumentation, Express startup, etc.):
 * ```ts
 * import { attachRuntime } from "@noverax/courier-studio-core/runtime";
 * await attachRuntime();
 * ```
 *
 * Browser side (build-plugin-injected snippet):
 * ```ts
 * globalThis[Symbol.for("courier.studio.url")] = "http://127.0.0.1:6280";
 * await attachRuntime("next-browser");
 * ```
 *
 * # Idempotency
 *
 * Calling `attachRuntime()` twice with the same explicit `runtimeId`
 * returns the same handle. Calling it without an id auto-derives one from
 * the framework (`detectFramework()` for server, `"browser"` fallback for
 * the DOM context). The auto-derived id is also idempotent across calls.
 */

import {
  createLogger,
  detectAppOrigin,
  getSources,
  registerSources,
  setAppOrigin,
  studioHooks,
} from "@noverax/courier";
import type { AnySource } from "@noverax/courier/define";
import { EventBus } from "../event-bus";
import { type BufferedAnnouncement, consumeAnnouncements } from "./announce-hosting";
import type { RuntimeHandle, RuntimeKind } from "./attach-runtime-types";
import { connectRuntimeSocket } from "./connect-runtime-socket";
import { wireHooks, wireHttpHooks } from "./hooks";
import type { LoadedCourierConfig } from "./load-config";
import { installSourceRegistry } from "./runtime-source-registry";
import {
  createSourceNameResolver,
  findMatchingSourceKey,
  resolveNewSourceKey,
} from "./source-resolution";

const log = createLogger("Runtime");

interface InternalHandle extends RuntimeHandle {
  setDisposer(fn: () => void): void;
}

const handles = new Map<string, InternalHandle>();

const STUDIO_URL_KEY = Symbol.for("courier.studio.url");
const DEFAULT_STUDIO_URL = "http://127.0.0.1:6280";

const HOOKS_INSTALLED_KEY = Symbol.for("courier.studio.attach-runtime-source-defined-installed");

/** True when running inside a real DOM (browser, jsdom, etc.). */
function detectBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Detect a sensible default `runtimeId` from environment hints when the
 * caller passes no explicit id. Browser context falls back to `"browser"`;
 * server context inspects `process.env` for the canonical framework brands.
 */
function detectDefaultRuntimeId(isBrowser: boolean): string {
  if (isBrowser) return "browser";
  if (typeof process === "undefined" || !process.env) return "server";
  const env = process.env;
  if (env.NEXT_RUNTIME === "nodejs") return "next-server";
  if (env.NEXT_RUNTIME === "edge") return "next-edge";
  if (env.NEXT_RUNTIME) return `next-${env.NEXT_RUNTIME}`;
  if (env.__NUXT__) return "nuxt-server";
  return "server";
}

/** Resolve the Studio URL from globalThis injection, env, or the canonical default. */
function resolveStudioUrl(): string {
  const slot = (globalThis as Record<symbol, unknown>)[STUDIO_URL_KEY];
  if (typeof slot === "string" && slot.length > 0) return slot;
  const env = typeof process !== "undefined" ? process.env?.COURIER_STUDIO_URL : undefined;
  return env ?? DEFAULT_STUDIO_URL;
}

/**
 * Install the `studioHooks.onSourceDefined` listener exactly once per
 * process. The listener merges new `defineApi()` results into the global
 * sources registry on the fly — needed both in dev (HMR replays) and in
 * production (rare but valid for runtimes that build sources lazily).
 *
 * Pinned to `globalThis` via `Symbol.for` so module duplication across
 * Turbopack / webpack chunks does not split the install state.
 */
function installSourceDefinedHook(): void {
  const g = globalThis as Record<symbol, unknown>;
  if (g[HOOKS_INSTALLED_KEY]) return;
  g[HOOKS_INSTALLED_KEY] = true;

  studioHooks.onSourceDefined = (newSource: unknown, baseURL: string) => {
    const current = getSources() ?? {};
    const src = newSource as AnySource;

    if (baseURL) {
      const key = findMatchingSourceKey(current, src, baseURL);
      if (key) {
        current[key] = src;
        registerSources({ ...current });
        return;
      }
    }

    current[resolveNewSourceKey(current, src)] = src;
    registerSources({ ...current });
  };
}

/**
 * Connect this runtime to a Studio dev server.
 *
 * @param id - Optional explicit runtime id. Defaults to a framework-derived
 *   value (`next-server`, `nuxt-server`, `browser`, …). Two calls with the
 *   same resolved id return the same handle (idempotent).
 *
 * @returns A handle whose `.detach()` method tears down the socket and
 *   cleans up announcement subscriptions. Returning a Promise lets the
 *   server path await the disk-loaded config; the browser path resolves
 *   immediately.
 */
export async function attachRuntime(id?: string): Promise<RuntimeHandle> {
  const isBrowser = detectBrowser();
  const runtimeId = id ?? detectDefaultRuntimeId(isBrowser);

  const existing = handles.get(runtimeId);
  if (existing) return existing;

  // ── Production-relevant: source registry + appOrigin + onSourceDefined ──

  installSourceDefinedHook();

  if (!isBrowser) {
    let loaded: LoadedCourierConfig | null = null;
    try {
      /* Imported here rather than at the top so the client bundle, which also
         reaches this module, never has the disk loader in its graph. */
      const { loadCourierConfig } = await import("./load-config");
      loaded = await loadCourierConfig();
    } catch (err) {
      /* Attaching must not take down the host application, but a config that
         exists and will not load leaves it with no sources at all — say why. */
      log.error("courier.config could not be loaded; no sources were registered", err);
    }
    if (loaded) {
      registerSources(loaded.config.sources);
      setAppOrigin(loaded.config.runtime?.appOrigin ?? detectAppOrigin());
    } else {
      setAppOrigin(detectAppOrigin());
    }
  }

  // Install the announce-driven runtime source registry BEFORE consuming
  // the announcements, so past announcements replay into both the wire
  // pending buffer and the global registry that the playground responder
  // reads from.
  installSourceRegistry();

  let detached = false;
  let unsubscribeAnnouncements: (() => void) | null = null;
  let socketDisposer: (() => void) | null = null;
  const pending: BufferedAnnouncement[] = [];

  const handle: InternalHandle = {
    runtimeId,
    kind: isBrowser ? "browser" : "server",
    detach() {
      if (detached) return;
      detached = true;
      unsubscribeAnnouncements?.();
      socketDisposer?.();
      handles.delete(runtimeId);
    },
    setDisposer(fn) {
      socketDisposer = fn;
    },
  };
  handles.set(runtimeId, handle);

  unsubscribeAnnouncements = consumeAnnouncements((entry) => {
    pending.push(entry);
  });

  // ── Dev-only: studio observability + Studio /runtime socket ───────────

  const isProduction = typeof process !== "undefined" && process.env?.NODE_ENV === "production";
  if (!isProduction) {
    const bus = new EventBus();
    const resolveSourceName = createSourceNameResolver(getSources);
    wireHooks(bus, runtimeId, resolveSourceName);
    wireHttpHooks(bus, runtimeId, resolveSourceName);

    const studioUrl = resolveStudioUrl();
    void connectRuntimeSocket({ runtimeId, kind: handle.kind, studioUrl, bus }, pending, handle);
  }

  return handle;
}

/** Reset all attached handles — for tests only. */
export function _resetRuntimeHandlesForTests(): void {
  for (const handle of handles.values()) handle.detach();
  handles.clear();
  const g = globalThis as Record<symbol, unknown>;
  g[HOOKS_INSTALLED_KEY] = false;
  studioHooks.onSourceDefined = undefined;
}

export type { RuntimeHandle, RuntimeKind };
