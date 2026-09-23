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
 * `courier.config.ts.runtime.appOrigin` or an env var fallback.
 * Framework adapters may also discover it from the first incoming
 * request's `Host` header when nothing more explicit is available.
 * User code should not call `setAppOrigin` directly — set
 * `runtime.appOrigin` in `courier.config.ts` or set the `COURIER_APP_URL`
 * environment variable.
 */

import { ConfigurationError } from "./errors";
import type { ResolveOrigin } from "./proxy-caller";

const APP_ORIGIN_KEY = Symbol.for("courier.app-origin");
const g = globalThis as Record<symbol, unknown>;

/** Set the user-app's HTTP origin. Called by `attachRuntime()`. */
export function setAppOrigin(origin: string | undefined): void {
  if (origin === undefined) {
    delete g[APP_ORIGIN_KEY];
    return;
  }
  g[APP_ORIGIN_KEY] = origin;
}

/**
 * Adopt the origin a framework adapter saw a request addressed to as the
 * app's origin, unless one is already set — config and environment win.
 *
 * Adapters call it on every request until one carries a host. They used to
 * give up after the first request whatever it carried, so a host-less probe
 * that arrived first left the origin unset for the life of the process, and
 * Studio Playground proxy mode failed with `APP_ORIGIN_NOT_CONFIGURED`.
 *
 * @param origin - `scheme://host[:port]` the request was addressed to, if known
 * @example
 * discoverAppOrigin(new URL(request.url).origin);
 */
export function discoverAppOrigin(origin: string | undefined): void {
  if (!origin || origin === "null" || getAppOrigin()) return;
  setAppOrigin(origin);
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
