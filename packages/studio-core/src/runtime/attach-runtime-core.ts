/**
 * The implementation behind both builds of `attachRuntime`: the handle
 * registry, the in-flight attach sharing, and the connection to Studio.
 */

import { createLogger } from "@noverax/courier/client";
import type { CourierConfig } from "@noverax/courier/config";
import {
  createKeptBodies,
  getAppOrigin,
  getSources,
  inCloudflareWorker,
  inProduction,
  KEPT_BODY_BYTES,
  studioHooks,
} from "@noverax/courier/internal-studio";
import { EventBus } from "../event-bus";
import { type BufferedAnnouncement, consumeAnnouncements } from "./announce-hosting";
import type { RuntimeHandle } from "./attach-runtime-types";
import { type AnswerTrustedCalls, connectRuntimeSocket } from "./connect-runtime-socket";
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

const IN_A_WORKER =
  "Studio's runtime attaches nothing in a Cloudflare Worker, which keeps no connection open " +
  "between requests: for Studio to see the app's calls, serve its routes on Node in development.";

interface InternalHandle extends RuntimeHandle {
  setDisposer(fn: () => void): void;
  setAnnouncer(fn: () => void): void;
}

const handles = new Map<string, RuntimeHandle>();
const attaching = new Map<string, Promise<RuntimeHandle>>();

/** What a server runtime learns from its courier.config about reaching Studio. */
export interface ServerRuntimeSetup {
  /** Where Studio listens, from the config's `studio` block */
  studio: ConfiguredStudioAddress;
  /** This project's Studio token, read afresh for each connection */
  readToken: () => string | undefined;
  /** The config as it stands after the last reload */
  config: () => CourierConfig;
}

/**
 * Loads courier.config for a server runtime and says how to reach Studio.
 * The browser build of the runtime has none, so its graph never reaches the
 * disk loader, and a browser runtime presents no token.
 */
export type ServerConfigLoader = () => Promise<ServerRuntimeSetup | undefined>;

/**
 * What one build of `attachRuntime` brings to the attach. The server's
 * brings its config loader, which reads the project's token, and what
 * answers the calls Studio sends only a runtime that showed it the token;
 * the browser's brings neither, so its graph reaches none of the server's
 * half of the core.
 */
export interface RuntimeBuild {
  /** Loads the config when this is a server process */
  readonly loadServerConfig?: ServerConfigLoader | undefined;
  /** Follows the HTTP version each of this runtime's calls went over */
  readonly observeVersions: () => HttpVersions;
  /** Answers the Playground's calls and a webhook's deliveries */
  readonly answerTrusted?: AnswerTrustedCalls | undefined;
}

/**
 * `attachRuntime` for either build. In a Cloudflare Worker it attaches
 * nothing, whatever the build, and says so once.
 *
 * @param build - What the build brings: see {@link RuntimeBuild}
 * @param id - The runtime id; see `attachRuntime`.
 * @returns The runtime's handle.
 * @example
 * ```ts
 * attachRuntimeUsing({ observeVersions: observeBrowserHttpVersions }, "vite-browser");
 * ```
 */
export async function attachRuntimeUsing(build: RuntimeBuild, id?: string): Promise<RuntimeHandle> {
  const isBrowser = detectBrowser();
  const runtimeId = id ?? detectDefaultRuntimeId(isBrowser);

  const existing = handles.get(runtimeId);
  if (existing) return existing;
  if (inCloudflareWorker()) return attachNothing(runtimeId);

  /* A second call made while the first still loads the config shares its
     attach, rather than opening a second socket under the same id that no
     handle could close. */
  const inFlight = attaching.get(runtimeId);
  if (inFlight) return inFlight;
  /* A page has neither the config nor the project's token, whichever build
     of the runtime its bundler took: Studio sends it none of the calls a
     server's runtime answers. */
  const taken: RuntimeBuild = isBrowser ? { observeVersions: build.observeVersions } : build;
  const attach = attachFresh(runtimeId, isBrowser, taken).finally(() =>
    attaching.delete(runtimeId),
  );
  attaching.set(runtimeId, attach);
  return attach;
}

async function attachFresh(
  runtimeId: string,
  isBrowser: boolean,
  build: RuntimeBuild,
): Promise<RuntimeHandle> {
  // ── Production-relevant: source registry + appOrigin ──

  const setup = await build.loadServerConfig?.();

  let detached = false;
  let unsubscribeAnnouncements: (() => void) | null = null;
  let socketDisposer: (() => void) | null = null;
  let flushAnnouncements: (() => void) | undefined;
  let versions: HttpVersions | undefined;
  const pending: BufferedAnnouncement[] = [];

  const handle: InternalHandle = {
    runtimeId,
    kind: isBrowser ? "browser" : "server",
    config: () => setup?.config(),
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

  const isProduction = inProduction();
  if (!isProduction) {
    const bus = new EventBus();
    const resolveSourceName = createSourceNameResolver(getSources);
    /* A page keeps less of the app's bodies than a server process does. */
    const bodies = createKeptBodies(isBrowser ? BROWSER_KEPT_BODY_BYTES : KEPT_BODY_BYTES);
    wireHooks(bus, runtimeId, resolveSourceName, bodies);
    versions = build.observeVersions();
    wireHttpHooks(bus, runtimeId, resolveSourceName, versions);

    const studioUrl = resolveStudioUrl(setup?.studio);
    const input = {
      runtimeId,
      kind: handle.kind,
      studioUrl,
      bus,
      readToken: setup?.readToken,
      bodies,
      listenOrigin: isBrowser ? pageOrigin : getAppOrigin,
      answerTrusted: build.answerTrusted,
    };
    connectRuntimeSocket(input, pending, handle).catch((err: unknown) =>
      log.warn("Studio connection failed to start", err),
    );
  }

  return handle;
}

/* A Cloudflare Worker hosts no connection to Studio: it may open none as it loads, and one a
   request opens serves that request alone. Its runtime attaches nothing, and says so once. */
function attachNothing(runtimeId: string): RuntimeHandle {
  if (!inProduction()) log.info(IN_A_WORKER);
  const handle: RuntimeHandle = {
    runtimeId,
    kind: "server",
    config: () => undefined,
    detach() {
      handles.delete(runtimeId);
    },
  };
  handles.set(runtimeId, handle);
  return handle;
}

/* Where the page runs: what the browser runtime is served at. */
function pageOrigin(): string | undefined {
  return typeof location === "undefined" ? undefined : location.origin;
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
