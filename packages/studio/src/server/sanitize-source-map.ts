/**
 * Whitelist sanitizer for `SourceMap` payloads arriving over the
 * Socket.IO `connection:init` / `connection:sources` events.
 *
 * The studio dev server is a long-lived process that accepts connections
 * from any locally-running app — including apps on different Nexus
 * versions, partially-initialized startups, and hand-rolled scripts. The
 * sanitizer enforces two guarantees:
 *
 *  1. **Crash safety**: every field is validated before being read;
 *     malformed input collapses to safe defaults instead of throwing
 *     inside the catalog merge pipeline.
 *
 *  2. **Forward / backward compatibility**: each field is independently
 *     gated. New optional fields require an explicit guard here —
 *     otherwise they are silently dropped before reaching the catalog
 *     converters and the UI sees an empty value.
 *
 * If you add a new optional field to `SourceMap[string]`, you MUST add
 * a corresponding guard here AND extend the sanitizer tests with a
 * positive + malformed-input case.
 */

import type { ProxyPath } from "@noverax/nexus";
import type { SourceMap } from "@noverax/nexus-studio-core";

/**
 * Validate a `proxyPath` payload field. Each transport string is accepted
 * independently; anything not a string is dropped. Returns `undefined`
 * when the result would be an empty object so downstream conditional
 * spreading (`...(proxyPath && { proxyPath })`) drops the key entirely.
 */
export function sanitizeProxyPath(raw: unknown): ProxyPath | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const src = raw as Record<string, unknown>;
  const result: ProxyPath = {};
  if (typeof src.http === "string") result.http = src.http;
  if (typeof src.sse === "string") result.sse = src.sse;
  if (typeof src.ws === "string") result.ws = src.ws;
  return result.http || result.sse || result.ws ? result : undefined;
}

/**
 * Validate the `appOrigin` field. Accepts only non-empty strings — anything
 * else (including the empty string) collapses to undefined so the UI knows
 * to fall back to relative-path display.
 */
export function sanitizeAppOrigin(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/**
 * Sanitize a `SourceMap` arriving from a connected app socket. Drops
 * non-object entries, coerces missing `groups` to an empty record, and
 * forwards `proxyPath` / `appOrigin` only when their shapes validate.
 * Returns `undefined` when the input has no usable entries so the caller
 * can skip the runtime layer update entirely.
 */
export function sanitizeSourceMap(raw: unknown): SourceMap | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const result: SourceMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const src = value as Record<string, unknown>;
    const baseURL = typeof src.baseURL === "string" ? src.baseURL : "";
    const groups =
      src.groups && typeof src.groups === "object"
        ? (src.groups as SourceMap[string]["groups"])
        : ({} as SourceMap[string]["groups"]);
    const appOrigin = sanitizeAppOrigin(src.appOrigin);
    const proxyPath = sanitizeProxyPath(src.proxyPath);
    result[key] = {
      baseURL,
      groups,
      ...(appOrigin && { appOrigin }),
      ...(proxyPath && { proxyPath }),
    };
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
