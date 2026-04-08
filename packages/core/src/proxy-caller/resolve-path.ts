/**
 * `resolveProxyPath` — the single point of truth that turns a `ProxyPath`
 * configuration into a concrete absolute URL string for a given transport.
 *
 * Resolution rules (in order):
 *
 *  1. **Absolute URL** (`http://`, `https://`, `ws://`, `wss://`) → used as-is.
 *     This is the cross-origin escape hatch for HTTP/SSE and the *required*
 *     form for WS in runtimes that cannot host WebSocket upgrades in-process
 *     (Next.js, Cloudflare Workers, Vercel Edge, AWS Lambda).
 *
 *  2. **Omitted** → built-in default for HTTP (`"/api/request"`) and SSE
 *     (`"/api/sse"`). For WS there is no default — `WS_PATH_NOT_CONFIGURED`
 *     is thrown so production breakage cannot hide behind a `localhost` value.
 *
 *  3. **Relative path** (`"/api/request"`) → resolved against the runtime
 *     origin. In the browser this is `globalThis.location`; in SSR / Node
 *     contexts the caller must inject `origin` explicitly. WS additionally
 *     promotes `https:` → `wss:` and `http:` → `ws:`.
 *
 * The function is dependency-free aside from `ConfigurationError` so it can
 * be safely called from both browser code and Node-side studio executors.
 */

import { ConfigurationError } from "../error";
import type { ProxyPath } from "./proxy-path";

/** Discriminator for the three supported transports. */
export type Transport = "http" | "sse" | "ws";

/**
 * Origin shape used for SSR resolution. Mirrors the subset of `Location` we
 * actually need so callers can pass plain `URL` instances or per-request
 * structs without coupling to the DOM API.
 */
export type ResolveOrigin = {
  protocol: string;
  host: string;
};

const HTTP_SCHEME_RE = /^https?:\/\//i;
const WS_SCHEME_RE = /^wss?:\/\//i;
const PROTOCOL_RELATIVE_RE = /^\/\//;

function isAbsoluteUrl(value: string): boolean {
  return HTTP_SCHEME_RE.test(value) || WS_SCHEME_RE.test(value);
}

/**
 * Resolve a `ProxyPath` field into a concrete URL string for the given
 * transport. Throws {@link ConfigurationError} for misconfiguration.
 *
 * @param transport - Which transport's path to resolve.
 * @param proxyPath - The configured `ProxyPath` (already merged across
 *   caller-level and source-level defaults via `mergeProxyPath`).
 * @param origin - Optional explicit origin for SSR / Node contexts where
 *   `globalThis.location` is unavailable.
 * @returns Absolute URL ready to be passed to `fetch` / `EventSource` /
 *   `new WebSocket`.
 *
 * @example
 * ```ts
 * resolveProxyPath("http", undefined);
 * // → "https://app.example.com/api/request" (in the browser)
 *
 * resolveProxyPath("ws", { ws: "wss://realtime.example.com" });
 * // → "wss://realtime.example.com"
 *
 * resolveProxyPath("ws", undefined);
 * // → throws ConfigurationError("WS_PATH_NOT_CONFIGURED", ...)
 * ```
 */
export function resolveProxyPath(
  transport: Transport,
  proxyPath: ProxyPath | undefined,
  origin?: ResolveOrigin,
): string {
  const configured = proxyPath?.[transport];

  if (configured !== undefined) {
    if (configured === "") {
      throw new ConfigurationError(
        "PROXY_PATH_INVALID",
        `[nexus] proxyPath.${transport} cannot be an empty string. Omit the field to use defaults, or pass a path / absolute URL.`,
      );
    }
    if (PROTOCOL_RELATIVE_RE.test(configured) && !WS_SCHEME_RE.test(configured)) {
      throw new ConfigurationError(
        "PROXY_PATH_INVALID",
        `[nexus] proxyPath.${transport}="${configured}" — protocol-relative URLs are not supported. Use an absolute URL ("https://..." / "wss://...") or a path starting with "/".`,
      );
    }
    if (isAbsoluteUrl(configured)) {
      assertTransportScheme(transport, configured);
      return configured;
    }
    if (!configured.startsWith("/")) {
      throw new ConfigurationError(
        "PROXY_PATH_INVALID",
        `[nexus] proxyPath.${transport}="${configured}" must start with "/" for relative paths or with a scheme for absolute URLs.`,
      );
    }
    return joinOriginWithPath(transport, configured, origin);
  }

  // Field omitted: apply per-transport built-in defaults.
  if (transport === "http") return joinOriginWithPath("http", "/api/request", origin);
  if (transport === "sse") return joinOriginWithPath("sse", "/api/sse", origin);

  // WS has no default — silent localhost fallbacks caused prod-only failures.
  throw new ConfigurationError(
    "WS_PATH_NOT_CONFIGURED",
    [
      "[nexus] WS endpoint requires `proxyPath.ws` to be configured.",
      "",
      "In Next.js / Cloudflare / serverless apps, run @noverax/nexus-server",
      "separately and point `proxyPath.ws` at it, e.g.:",
      '  proxyPath: { ws: "ws://localhost:3001" }      // dev',
      '  proxyPath: { ws: "wss://realtime.example.com" } // prod',
      "",
      "See the deployment guide for the full runtime matrix:",
      "  https://nexus.noverax.com/docs/deployment/standalone-server",
    ].join("\n"),
  );
}

function assertTransportScheme(transport: Transport, value: string): void {
  if (transport === "ws") {
    if (!WS_SCHEME_RE.test(value)) {
      throw new ConfigurationError(
        "PROXY_PATH_INVALID",
        `[nexus] proxyPath.ws="${value}" must use the ws:// or wss:// scheme.`,
      );
    }
    return;
  }
  if (!HTTP_SCHEME_RE.test(value)) {
    throw new ConfigurationError(
      "PROXY_PATH_INVALID",
      `[nexus] proxyPath.${transport}="${value}" must use the http:// or https:// scheme.`,
    );
  }
}

function joinOriginWithPath(
  transport: Transport,
  path: string,
  origin: ResolveOrigin | undefined,
): string {
  const loc = origin ?? readGlobalLocation();
  if (!loc) {
    throw new ConfigurationError(
      "PROXY_PATH_NO_ORIGIN",
      `[nexus] cannot resolve relative ${transport} path "${path}" — no origin available. Pass an absolute URL in proxyPath.${transport}, or run inside a browser/SSR context with location.`,
    );
  }
  if (transport === "ws") {
    const wsProto = loc.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProto}//${loc.host}${path}`;
  }
  return `${loc.protocol}//${loc.host}${path}`;
}

function readGlobalLocation(): ResolveOrigin | undefined {
  const loc = (globalThis as { location?: { protocol?: string; host?: string } }).location;
  if (!loc || typeof loc.protocol !== "string" || typeof loc.host !== "string" || loc.host === "") {
    return undefined;
  }
  return { protocol: loc.protocol, host: loc.host };
}
