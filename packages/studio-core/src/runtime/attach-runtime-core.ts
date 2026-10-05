/**
 * The implementation behind both builds of `attachRuntime`: the handle
 * registry, the in-flight attach sharing, and the connection to Studio.
 */

import { createLogger, getSources } from "@noverax/courier";
import { createKeptBodies, KEPT_BODY_BYTES, studioHooks } from "@noverax/courier/internal";
import { EventBus } from "../event-bus";
import { type BufferedAnnouncement, consumeAnnouncements } from "./announce-hosting";
import type { RuntimeHandle } from "./attach-runtime-types";
import { connectRuntimeSocket } from "./connect-runtime-socket";
import { wireHooks, wireHttpHooks } from "./hooks";
import type { HttpVersions } from "./http-versions/http-version";
import {
  type ConfiguredStudioAddress,
  detectBrowser,
  detectDefaultRuntimeId,
  resolveStudioUrl,
} from "./runtime-environment";
import { createSourceNameResolver } from "./source-resolution";

const log = createLogger("Runtime");

/* The most bytes of whole bodies a page keeps for Studio. */
const BROWSER_KEPT_BODY_BYTES = 16 * 1024 * 1024;

interface InternalHandle extends RuntimeHandle {
  setDisposer(fn: () => void): void;
  setAnnouncer(fn: () => void): void;
}

const handles = new Map<string, InternalHandle>();
const attaching = new Map<string, Promise<RuntimeHandle>>();

/** What a server runtime learns from its courier.config about reaching Studio. */
export interface ServerRuntimeSetup {
  /** Where Studio listens, from the config's `studio` block */
  studio: ConfiguredStudioAddress;
  /** This project's Studio token, read afresh for each connection */
  readToken: () => string | undefined;
}

/**
 * Loads courier.config for a server runtime and says how to reach Studio.
 * The browser build of the runtime has none, so its graph never reaches the
 * disk loader, and a browser runtime presents no token.
 */
export type ServerConfigLoader = () => Promise<ServerRuntimeSetup | undefined>;

/**
 * `attachRuntime` for either build: the server one passes its config loader,
 * the browser one passes nothing.
 *
 * @param loadServerConfig - Loads the config when this is a server process.
 * @param id - The runtime id; see `attachRuntime`.
 * @returns The runtime's handle.
 */
export async function attachRuntimeUsing(
  loadServerConfig: ServerConfigLoader | undefined,
  id?: string,
  observeVersions?: () => HttpVersions,
): Promise<RuntimeHandle> {
  const isBrowser = detectBrowser();
  const runtimeId = id ?? detectDefaultRuntimeId(isBrowser);

  const existing = handles.get(runtimeId);
  if (existing) return existing;

  /* A second call made while the first still loads the config shares its
     attach, rather than opening a second socket under the same id that no
     handle could close. */
  const inFlight = attaching.get(runtimeId);
  if (inFlight) return inFlight;
  const loader = isBrowser ? undefined : loadServerConfig;
  const attach = attachFresh(runtimeId, isBrowser, loader, observeVersions).finally(() =>
    attaching.delete(runtimeId),
  );
  attaching.set(runtimeId, attach);
  return attach;
}

async function attachFresh(
  runtimeId: string,
  isBrowser: boolean,
  loadServerConfig: ServerConfigLoader | undefined,
  observeVersions: (() => HttpVersions) | undefined,
): Promise<RuntimeHandle> {
  // ── Production-relevant: source registry + appOrigin ──

  const setup = await loadServerConfig?.();

  let detached = false;
  let unsubscribeAnnouncements: (() => void) | null = null;
  let socketDisposer: (() => void) | null = null;
  let flushAnnouncements: (() => void) | undefined;
  let versions: HttpVersions | undefined;
  const pending: BufferedAnnouncement[] = [];

  const handle: InternalHandle = {
    runtimeId,
    kind: isBrowser ? "browser" : "server",
    detach() {
      if (detached) return;
      detached = true;
      versions?.dispose();
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
    /* A page keeps less of the app's bodies than a server process does. */
    const bodies = createKeptBodies(isBrowser ? BROWSER_KEPT_BODY_BYTES : KEPT_BODY_BYTES);
    wireHooks(bus, runtimeId, resolveSourceName, bodies);
    versions = observeVersions?.();
    wireHttpHooks(bus, runtimeId, resolveSourceName, versions);

    const studioUrl = resolveStudioUrl(setup?.studio);
    const input = {
      runtimeId,
      kind: handle.kind,
      studioUrl,
      bus,
      readToken: setup?.readToken,
      bodies,
    };
    connectRuntimeSocket(input, pending, handle).catch((err: unknown) =>
      log.warn("Studio connection failed to start", err),
    );
  }

  return handle;
}

/** Reset all attached handles — for tests only. */
export function _resetRuntimeHandlesForTests(): void {
  for (const handle of handles.values()) handle.detach();
  handles.clear();
  attaching.clear();
  /* A server attach follows the config through this hook; see
     `followConfigSources`. */
  studioHooks.onSourceDefined = undefined;
}
