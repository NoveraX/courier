import { STUDIO_DEFAULT_URL } from "@noverax/courier/config";

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

/** Resolve the Studio URL from globalThis injection, env, or the canonical default. */
export function resolveStudioUrl(): string {
  const slot = (globalThis as Record<symbol, unknown>)[STUDIO_URL_KEY];
  if (typeof slot === "string" && slot.length > 0) return slot;
  const env = typeof process !== "undefined" ? process.env?.COURIER_STUDIO_URL : undefined;
  return env ?? STUDIO_DEFAULT_URL;
}
