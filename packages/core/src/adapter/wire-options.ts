/**
 * The options a proxy client is allowed to set, and the parser that enforces
 * it at the boundary.
 *
 * A caller reaching the proxy is untrusted: it is a browser, and whatever it
 * sends is chosen by whoever controls the page. Anything that is forwarded
 * into the server's own `fetch` therefore has to be listed here explicitly,
 * because a field that merely passes through decides where the request goes,
 * what credentials ride along with it, and what comes back.
 *
 * An unexpected field is refused rather than dropped. Dropping it silently
 * would let a probe keep running against a server that looks like it accepted
 * the request, and would leave nothing a test could assert.
 *
 * A server-side caller does not come through here. It runs in the same
 * process, already decides the destination, and keeps the full option set.
 */

import { isRecord } from "../utils/is-record";
import { reviveWithoutPrototypeKeys } from "../utils/safe-json";
import { LIMITS } from "./limits";

/** Options a proxy client may set. Everything else is refused. */
export interface WireOptions {
  /** Return `{ status, headers, data }` instead of the bare body. */
  rawData?: boolean;
  /** Stream the upstream response rather than buffering it. */
  stream?: boolean;
  /** Send the caller's variables upstream. */
  forwardVariables?: boolean;
  /** Per-call deadline in ms, capped at `LIMITS.MAX_PROXY_TIMEOUT_MS`. */
  timeout?: number;
}

export type WireOptionsResult =
  | { ok: true; options: WireOptions | undefined }
  | { ok: false; reason: string };

const BOOLEAN_KEYS = ["rawData", "stream", "forwardVariables"] as const;
const ALLOWED_KEYS: ReadonlySet<string> = new Set([...BOOLEAN_KEYS, "timeout"]);

/**
 * Validate a decoded options object from a proxy request.
 *
 * @param raw - The decoded value, from the `_o` parameter or the request body
 * @returns The accepted options, or the reason the request is refused
 *
 * @example
 * ```ts
 * parseWireOptions({ rawData: true }); // → { ok: true, options: { rawData: true } }
 * parseWireOptions({ prefixUrl: "http://evil" }); // → { ok: false, reason: … }
 * ```
 */
export function parseWireOptions(raw: unknown): WireOptionsResult {
  if (raw === undefined || raw === null) return { ok: true, options: undefined };

  if (!isRecord(raw)) return { ok: false, reason: "options must be an object" };

  const entries = Object.entries(raw);
  const rejected = entries.map(([key]) => key).filter((key) => !ALLOWED_KEYS.has(key));
  if (rejected.length > 0) {
    return {
      ok: false,
      reason: `options may not contain ${rejected.sort().join(", ")}. A proxy request may set ${[...ALLOWED_KEYS].sort().join(", ")}`,
    };
  }

  const options: WireOptions = {};
  for (const key of BOOLEAN_KEYS) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean")
      return { ok: false, reason: `options.${key} must be a boolean` };
    options[key] = value;
  }

  const { timeout } = raw;
  if (timeout !== undefined) {
    if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0) {
      return { ok: false, reason: "options.timeout must be a positive number of milliseconds" };
    }
    options.timeout = Math.min(timeout, LIMITS.MAX_PROXY_TIMEOUT_MS);
  }

  return { ok: true, options: Object.keys(options).length > 0 ? options : undefined };
}

/**
 * Decode and validate a JSON options string — the `_o` query parameter of a
 * GET request, or the `_options` field of a multipart body.
 *
 * @param raw - The raw string, or null when absent
 * @returns The accepted options, or the reason the request is refused
 */
export function parseWireOptionsJson(raw: string | null): WireOptionsResult {
  if (!raw) return { ok: true, options: undefined };

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw, reviveWithoutPrototypeKeys);
  } catch {
    /* The reason travels back to the caller, so nothing is swallowed here. */
    return { ok: false, reason: "options is not valid JSON" };
  }
  return parseWireOptions(decoded);
}
