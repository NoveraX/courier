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
 * standalone server or Studio's dev-server plugins adopt the address the
 * server listens on. Framework adapters may also learn it, in development,
 * from what the server knows of itself — the socket a request arrived on,
 * or the framework's own address — and never from a request's headers,
 * which would let whoever sends one take the Playground's calls elsewhere.
 * See `discoverAppOrigin`.
 * User code should not call `setAppOrigin` directly — set
 * `runtime.appOrigin` in `courier.config.ts` or set the `COURIER_APP_URL`
 * environment variable.
 */

import { ConfigurationError } from "./errors";
import type { ResolveOrigin } from "./proxy-caller";
import { isDevelopment } from "./utils/development";

const APP_ORIGIN_KEY = Symbol.for("courier.app-origin");
const g = globalThis as Record<symbol, unknown>;

/**
 * Where Studio's dev-server plugins leave the address the dev server listens
 * on, for the app's own process and any worker it starts — Nuxt runs its
 * server in one — to find: below `COURIER_APP_URL` and `APP_URL`, which a
 * developer sets.
 */
export const DEV_SERVER_ORIGIN_ENV = "COURIER_DEV_SERVER_ORIGIN";

/** Where Next.js records the address its server listens on, as it starts, under a name of its own. */
export const NEXT_ORIGIN_ENV = "__NEXT_PRIVATE_ORIGIN";

/* Read in turn: what a developer sets, then what a server records of itself. */
const ORIGIN_ENVS = ["COURIER_APP_URL", "APP_URL", DEV_SERVER_ORIGIN_ENV, NEXT_ORIGIN_ENV] as const;

/** Set the user-app's HTTP origin. Called by `attachRuntime()`. */
export function setAppOrigin(origin: string | undefined): void {
  if (origin === undefined) {
    delete g[APP_ORIGIN_KEY];
    return;
  }
  g[APP_ORIGIN_KEY] = origin;
}

/**
 * Take an origin an adapter learned as the app's, in development, unless one
 * is set — see `discoverAppOrigin`, which decides what may teach it.
 *
 * @param origin - The origin, as `discoverAppOrigin` built it
 * @returns Whether it was taken
 * @example
 * learnAppOrigin("http://localhost:3000");
 */
export function learnAppOrigin(origin: string): boolean {
  if (getAppOrigin() || !isDevelopment()) return false;
  g[APP_ORIGIN_KEY] = origin;
  return true;
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
        "[courier] Studio Playground proxy mode needs the app's origin (`appOrigin`), and none is known yet.",
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
        "In development it is learned from the server itself: the address Next.js",
        "records as it starts, the server Studio's Vite plugin or Nuxt module sees serve",
        "(SvelteKit, Astro, React Router, Nuxt), or the socket of the first request a",
        "Courier route serves (Express, Fastify, NestJS, Hono on Node or Bun,",
        "SolidStart), so open a page that calls the API first. Set it where Studio",
        "cannot see the server: Deno, Cloudflare Workers, a server on a UNIX socket, or",
        "an app that routes by the Host name it is reached at.",
        "",
        "There is no auto-fallback because the correct value depends on your",
        "runtime (custom port, Docker host, HTTPS in dev, reverse proxy, etc.)",
        "and a wrong guess would silently route requests to nowhere.",
        "",
        "See https://courier.noverax.cloud/docs/api/config#app-origin",
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
 *  3. `COURIER_DEV_SERVER_ORIGIN` — the address a dev server listens on, as
 *     Studio's Vite plugin or Nuxt module saw it serve; never set by hand.
 *  4. `__NEXT_PRIVATE_ORIGIN` — the address Next.js records its server
 *     listens on as it starts, `https` only with its own certificate, before
 *     it loads the app and its `instrumentation.ts`. Next's own name for it,
 *     read last: where a Next version records none, its adapter learns the
 *     address from the first request a Courier route serves.
 *
 * # Explicitly rejected sources (and why)
 *
 * **`NEXT_PUBLIC_APP_URL`** — `NEXT_PUBLIC_*` is a Next.js *client-side*
 * convention (variables with this prefix are inlined into the browser
 * bundle). Reading it for *server-side* Studio config would import the wrong
 * semantic into a framework-agnostic package; Next's record of its own
 * server's address, above, is what names it.
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
  for (const name of ORIGIN_ENVS) {
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}
