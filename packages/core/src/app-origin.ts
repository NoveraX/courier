/**
 * `appOrigin` registry — the user-app's own HTTP origin used by the Studio
 * Playground proxy executor for self-loopback requests.
 *
 * # Why this exists
 *
 * Studio Playground proxy mode runs the executor inside the user-app's Node
 * process (Next.js App Router, standalone server, framework adapter). When
 * the user clicks "Subscribe" on an SSE/WS endpoint in proxy mode, the
 * executor calls `createProxySSEFactory` / `createProxyWSChannelFactory` and
 * those factories try to open a real network connection to the configured
 * `proxyPath.{sse,ws}` URL.
 *
 * If `proxyPath.sse` is a *relative* path (`/api/sse`), Node `fetch` and
 * `new WebSocket(...)` reject it — they only accept absolute URLs. The
 * browser's `globalThis.location` is unavailable, so `resolveProxyPath`
 * needs an explicit origin to fall back to.
 *
 * That origin is the user-app's *own* HTTP origin — i.e. the same
 * scheme://host:port the browser uses to reach the app. We deliberately do
 * NOT auto-fall back to `http://localhost:3000` or any other guess: the user
 * may run on a custom port, behind a reverse proxy, in a Docker network with
 * a vhost, with HTTPS in dev, etc. A wrong default would silently route
 * requests to nowhere. If we cannot discover the origin from environment
 * variables, we throw `APP_ORIGIN_NOT_CONFIGURED` from the executor and
 * point the user at the configuration docs.
 *
 * # Storage
 *
 * Stored on `globalThis` via `Symbol.for` so it survives bundler module
 * duplication (Turbopack / webpack chunk boundaries) — the same pattern as
 * `studioHooks` and the active connection.
 *
 * # When set
 *
 * `attachRuntime()` sets this during startup, reading from
 * `courier.config.ts.runtime.appOrigin` or an env var fallback, and a
 * standalone server adopts the address it listens on. Framework adapters
 * may also learn it, in development, from a request that proves it names
 * this very server — see `discoverAppOrigin` — and never a name another
 * machine or another port could answer for, which would take the
 * Playground's calls there.
 * User code should not call `setAppOrigin` directly — set
 * `runtime.appOrigin` in `courier.config.ts` or set the `COURIER_APP_URL`
 * environment variable.
 */

import { ConfigurationError } from "./errors";
import type { ResolveOrigin } from "./proxy-caller";
import { isDevelopment } from "./utils/development";

const APP_ORIGIN_KEY = Symbol.for("courier.app-origin");
/* Set while the origin is one a request taught, rather than one configured. */
const LEARNED_KEY = Symbol.for("courier.app-origin.learned");
const g = globalThis as Record<symbol, unknown>;

/** Set the user-app's HTTP origin. Called by `attachRuntime()`. */
export function setAppOrigin(origin: string | undefined): void {
  delete g[LEARNED_KEY];
  if (origin === undefined) {
    delete g[APP_ORIGIN_KEY];
    return;
  }
  g[APP_ORIGIN_KEY] = origin;
}

/**
 * Take an origin a request taught as the app's, unless one is set — see
 * `discoverAppOrigin`, which decides what a request may teach. It does not
 * count as configured.
 *
 * @param origin - The origin, as `discoverAppOrigin` built it
 * @example
 * learnAppOrigin("http://127.0.0.1:3000");
 */
export function learnAppOrigin(origin: string): void {
  if (getAppOrigin() || !isDevelopment()) return;
  g[APP_ORIGIN_KEY] = origin;
  g[LEARNED_KEY] = true;
}

/**
 * Adopt the address a server listens on as the app's origin, unless one is
 * set: the server knows it itself, so it counts as configured. Only in
 * development, where Studio reads it.
 *
 * @param url - The address the server listens on
 * @example
 * adoptListenOrigin("http://127.0.0.1:3001");
 */
export function adoptListenOrigin(url: string): void {
  if (getAppOrigin() || !isDevelopment()) return;
  setAppOrigin(url);
}

/**
 * The app's origin when config, the environment or the server itself named
 * it — not one a request taught. What may be trusted with more than a
 * request: Studio's one-time pass goes to no learned origin but this
 * machine's.
 *
 * @returns The configured origin, or `undefined`
 * @example
 * configuredAppOrigin(); // → "https://shop.example" when COURIER_APP_URL names it
 */
export function configuredAppOrigin(): string | undefined {
  return g[LEARNED_KEY] === true ? undefined : getAppOrigin();
}

/** Read the raw `appOrigin` string. Returns `undefined` if not configured. */
export function getAppOrigin(): string | undefined {
  return g[APP_ORIGIN_KEY] as string | undefined;
}

/**
 * Read the configured `appOrigin` parsed into a `ResolveOrigin` shape that
 * `resolveProxyPath` accepts. Throws `APP_ORIGIN_NOT_CONFIGURED` if the
 * origin was never set — callers (Studio executors) catch this and surface
 * it to the Studio UI as a configuration error.
 *
 * Parsing failures (malformed URL, missing host) also throw — this is the
 * single point where we validate the user-supplied value.
 */
export function getAppOriginParsed(): ResolveOrigin {
  const raw = getAppOrigin();
  if (!raw) {
    throw new ConfigurationError(
      "APP_ORIGIN_NOT_CONFIGURED",
      [
        "[courier] Studio Playground proxy mode requires `appOrigin` to be set.",
        "",
        "Add it to courier.config.ts:",
        "  export default defineConfig({",
        "    sources: { ... },",
        '    runtime: { appOrigin: "http://localhost:3000" },',
        "  })",
        "",
        "Or set the COURIER_APP_URL environment variable:",
        "  COURIER_APP_URL=http://localhost:3000 npm run dev",
        "",
        "In development it is learned only from a request whose own Host header",
        "is localhost, 127.0.0.1 or [::1] on the port the server accepted it on,",
        "sent from this machine, as far as the framework can tell; React Router",
        "tells neither, so nothing is learned there. Behind a reverse proxy or a",
        "tunnel, in Docker, on a *.localhost name or a network address, set it.",
        "",
        "There is no auto-fallback because the correct value depends on your",
        "runtime (custom port, Docker host, HTTPS in dev, reverse proxy, etc.)",
        "and a wrong guess would silently route requests to nowhere.",
        "",
        "See https://courier.noverax.cloud/docs/frameworks/nextjs#studio-app-origin",
      ].join("\n"),
    );
  }
  try {
    const parsed = new URL(raw);
    if (!parsed.host) {
      throw new ConfigurationError(
        "APP_ORIGIN_NOT_CONFIGURED",
        `[courier] appOrigin="${raw}" has no host component. Use a full URL like "http://localhost:3000".`,
      );
    }
    return { protocol: parsed.protocol, host: parsed.host };
  } catch (err) {
    if (err instanceof ConfigurationError) throw err;
    throw new ConfigurationError(
      "APP_ORIGIN_NOT_CONFIGURED",
      `[courier] appOrigin="${raw}" is not a valid URL: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Discover `appOrigin` from environment variables. Returns `undefined` when
 * nothing usable is found — callers must then either ask the user for an
 * explicit value or accept that Playground proxy mode will fail.
 *
 * # Precedence (most explicit → least)
 *
 *  1. `COURIER_APP_URL` — purpose-built, namespace-prefixed env var for this
 *     exact field. The recommended primary value.
 *  2. `APP_URL` — generic convention used by Laravel, many Node boilerplates,
 *     and `dotenv` templates. Picked up only when `COURIER_APP_URL` is unset so
 *     existing project conventions don't require duplicate config.
 *
 * # Explicitly rejected sources (and why)
 *
 * **`NEXT_PUBLIC_APP_URL`** — `NEXT_PUBLIC_*` is a Next.js *client-side*
 * convention (variables with this prefix are inlined into the browser
 * bundle). Reading it for *server-side* Studio config would import the wrong
 * semantic into a framework-agnostic package. Next.js users who want
 * auto-detect should set `COURIER_APP_URL` explicitly.
 *
 * **Composed `PROTOCOL` + `HOST` + `PORT`** — three independent variables
 * cannot be combined safely:
 *  - `PORT` is often *implicit* in production (`https://app.com` listens on
 *    443, `PORT` is unset or set to 443 — and joining `:443` into the URL is
 *    technically valid but breaks downstream string matching).
 *  - `HOST=0.0.0.0` is the standard "listen on every interface" value in
 *    Docker / Kubernetes. It is **not** a connectable address — joining it
 *    into a URL produces something Node `fetch` will route to nowhere on
 *    most platforms (Linux happens to map it to `127.0.0.1`, macOS does
 *    not, behavior is unspecified).
 *  - `PROTOCOL` is undefined behind reverse proxies that terminate TLS:
 *    your app speaks `http` but the public origin is `https`.
 *  - Three-way composition silently *appears* to work locally and breaks
 *    only in production where it is most expensive to debug.
 *
 * The whole point of `appOrigin` is to be a single explicit knob the user
 * sets correctly for their deployment. We deliberately keep auto-detect
 * **conservative** so we never produce a wrong-but-plausible value.
 */
export function detectAppOrigin(): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const env = process.env;

  if (typeof env.COURIER_APP_URL === "string" && env.COURIER_APP_URL.length > 0) {
    return env.COURIER_APP_URL;
  }
  if (typeof env.APP_URL === "string" && env.APP_URL.length > 0) {
    return env.APP_URL;
  }
  return undefined;
}
