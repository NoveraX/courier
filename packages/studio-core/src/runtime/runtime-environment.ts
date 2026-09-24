import {
  formatStudioUrl,
  STUDIO_DEFAULT_HOST,
  STUDIO_DEFAULT_PORT,
  STUDIO_DEFAULT_URL,
} from "@noverax/courier/config";

const STUDIO_URL_KEY = Symbol.for("courier.studio.url");

/** True when running inside a real DOM (browser, jsdom, etc.). */
export function detectBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Detect a sensible default `runtimeId` from environment hints when the
 * caller passes no explicit id. Browser context falls back to `"browser"`;
 * server context inspects `process.env` for the canonical framework brands.
 */
export function detectDefaultRuntimeId(isBrowser: boolean): string {
  if (isBrowser) return "browser";
  if (typeof process === "undefined" || !process.env) return "server";
  const env = process.env;
  if (env.NEXT_RUNTIME === "nodejs") return "next-server";
  if (env.NEXT_RUNTIME === "edge") return "next-edge";
  if (env.NEXT_RUNTIME) return `next-${env.NEXT_RUNTIME}`;
  if (env.__NUXT__) return "nuxt-server";
  return "server";
}

/**
 * Whether this platform's timers can be unref'd, so that a pending one does
 * not keep the process alive. Node's and Bun's can; the numbers a browser,
 * Deno or an edge worker hands out cannot, and calling `.unref()` on them
 * throws.
 */
export function timersCanUnref(): boolean {
  const timer = setTimeout(() => {}, 0);
  clearTimeout(timer);
  return typeof (timer as { unref?: unknown }).unref === "function";
}

/** The `studio` block of courier.config, as far as the address goes. */
export interface ConfiguredStudioAddress {
  host?: string;
  port?: number;
}

/**
 * Resolve the Studio URL: the globalThis slot a build plugin pins, then
 * `COURIER_STUDIO_URL`, then the `studio` block of courier.config, then the
 * default.
 *
 * A server runtime passes the block it loaded. It used to be ignored, so with
 * `studio.port` set, Studio and the browser moved to the configured port while
 * every server runtime kept dialling the default one and never connected.
 */
export function resolveStudioUrl(configured?: ConfiguredStudioAddress): string {
  const slot = (globalThis as Record<symbol, unknown>)[STUDIO_URL_KEY];
  if (typeof slot === "string" && slot.length > 0) return slot;
  /* A plain member access, so that bundlers inlining `process.env.X` into the
     browser — Next.js's `env`, webpack's DefinePlugin — can replace it. */
  const env = typeof process !== "undefined" ? process.env.COURIER_STUDIO_URL : undefined;
  if (env) return env;
  if (configured?.host === undefined && configured?.port === undefined) return STUDIO_DEFAULT_URL;
  return formatStudioUrl(
    configured.host ?? STUDIO_DEFAULT_HOST,
    configured.port ?? STUDIO_DEFAULT_PORT,
  );
}
