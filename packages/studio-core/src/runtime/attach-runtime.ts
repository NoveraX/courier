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
 * globalThis[Symbol.for("courier.studio.url")] = "http://localhost:6280";
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

import { createLogger, getSources } from "@noverax/courier";
import { EventBus } from "../event-bus";
import { type BufferedAnnouncement, consumeAnnouncements } from "./announce-hosting";
import type { RuntimeHandle, RuntimeKind } from "./attach-runtime-types";
import { connectRuntimeSocket } from "./connect-runtime-socket";
import { wireHooks, wireHttpHooks } from "./hooks";
import { registerFromConfig } from "./register-from-config";
import { detectBrowser, detectDefaultRuntimeId, resolveStudioUrl } from "./runtime-environment";
import { installSourceRegistry } from "./runtime-source-registry";
import { installSourceDefinedHook, uninstallSourceDefinedHook } from "./source-defined-hook";
import { createSourceNameResolver } from "./source-resolution";

const log = createLogger("Runtime");

interface InternalHandle extends RuntimeHandle {
  setDisposer(fn: () => void): void;
  setAnnouncer(fn: () => void): void;
}

const handles = new Map<string, InternalHandle>();
const attaching = new Map<string, Promise<RuntimeHandle>>();

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

  /* A second call made while the first still loads the config shares its
     attach. It used to pass the check above too, and open a second socket
     under the same id that no handle could close. */
  const inFlight = attaching.get(runtimeId);
  if (inFlight) return inFlight;
  const attach = attachFresh(runtimeId, isBrowser).finally(() => attaching.delete(runtimeId));
  attaching.set(runtimeId, attach);
  return attach;
}

async function attachFresh(runtimeId: string, isBrowser: boolean): Promise<RuntimeHandle> {
  // ── Production-relevant: source registry + appOrigin + onSourceDefined ──

  installSourceDefinedHook();

  const studioAddress = isBrowser ? undefined : await registerFromConfig();

  // Install the announce-driven runtime source registry BEFORE consuming
  // the announcements, so past announcements replay into both the wire
  // pending buffer and the global registry that the playground responder
  // reads from.
  installSourceRegistry();

  let detached = false;
  let unsubscribeAnnouncements: (() => void) | null = null;
  let socketDisposer: (() => void) | null = null;
  let flushAnnouncements: (() => void) | undefined;
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
      /* A detach() made before the socket existed found nothing to close and
         left it connected for good; the socket now closes as it arrives. */
      if (detached) {
        fn();
        return;
      }
      socketDisposer = fn;
    },
    setAnnouncer(fn) {
      flushAnnouncements = fn;
    },
  };
  handles.set(runtimeId, handle);

  unsubscribeAnnouncements = consumeAnnouncements((entry) => {
    pending.push(entry);
    /* An adapter constructed after the socket opened would otherwise sit in
       the queue until the process ended. */
    flushAnnouncements?.();
  });

  // ── Dev-only: studio observability + Studio /runtime socket ───────────

  const isProduction = typeof process !== "undefined" && process.env?.NODE_ENV === "production";
  if (!isProduction) {
    const bus = new EventBus();
    const resolveSourceName = createSourceNameResolver(getSources);
    wireHooks(bus, runtimeId, resolveSourceName);
    wireHttpHooks(bus, runtimeId, resolveSourceName);

    const studioUrl = resolveStudioUrl(studioAddress);
    connectRuntimeSocket({ runtimeId, kind: handle.kind, studioUrl, bus }, pending, handle).catch(
      (err: unknown) => log.warn("Studio connection failed to start", err),
    );
  }

  return handle;
}

/** Reset all attached handles — for tests only. */
export function _resetRuntimeHandlesForTests(): void {
  for (const handle of handles.values()) handle.detach();
  handles.clear();
  attaching.clear();
  uninstallSourceDefinedHook();
}

export type { RuntimeHandle, RuntimeKind };
