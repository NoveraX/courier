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
 *  - **ALWAYS**: load config + register sources + set `appOrigin`.
 *
 *  - **DEV ONLY** (gated by `NODE_ENV !== "production"`): register the
 *    config's sources again whenever the application redefines one (see
 *    `followConfigSources`), wire all the Studio observability hooks (request
 *    lifecycle, middleware, validation, stream, fetch, proxy, cache, superseded calls,
 *    upload), open the `/runtime` Socket.IO connection, install the
 *    playground responder.
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

import { attachRuntimeUsing } from "./attach-runtime-core";
import type { RuntimeHandle, RuntimeKind } from "./attach-runtime-types";
import { observeBrowserHttpVersions } from "./http-versions/browser-http-versions";
import type { HttpVersions } from "./http-versions/http-version";
import { observeNodeHttpVersions } from "./http-versions/node-http-versions";
import { type ConfigRegistration, registerFromConfig } from "./register-from-config";
import { detectBrowser } from "./runtime-environment";

/**
 * Connect this runtime to a Studio dev server.
 *
 * @param id - Optional explicit runtime id. Defaults to a framework-derived
 *   value (`next-server`, `nuxt-server`, `browser`, …). Two calls with the
 *   same resolved id return the same handle (idempotent).
 * @param registration - How the config is loaded: `followFiles` loads it
 *   again whenever a file it depends on is saved, for a process no dev
 *   server reloads, such as the MCP server in an editor
 *
 * @returns A handle whose `.detach()` method tears down the socket and
 *   cleans up announcement subscriptions. Returning a Promise lets the
 *   server path await the disk-loaded config; the browser path resolves
 *   immediately.
 */
export function attachRuntime(
  id?: string,
  registration: ConfigRegistration = {},
): Promise<RuntimeHandle> {
  return attachRuntimeUsing(() => registerFromConfig(registration), id, observeHttpVersions);
}

/* A page runs this build where its bundler resolved the package without the
   `browser` condition. A bundler gives a page only a stand-in for Node's
   diagnostics channel, which has nothing to subscribe with, so the page reads
   its Resource Timing, as the browser build does. */
function observeHttpVersions(): HttpVersions {
  return detectBrowser() ? observeBrowserHttpVersions() : observeNodeHttpVersions();
}

export { _resetRuntimeHandlesForTests } from "./attach-runtime-core";
export type { ConfigRegistration, RuntimeHandle, RuntimeKind };
