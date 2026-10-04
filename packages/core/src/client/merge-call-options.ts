import { layerHeaders } from "../utils/layer-headers";

/**
 * Combine the options of two `.with()` calls, the later one on top.
 *
 * Headers are merged name by name, so a token set on the client survives a
 * group that adds a request id of its own; any other option the later call
 * sets replaces the earlier value.
 *
 * @param options - The options already in effect
 * @param next - The options the later `.with()` gave
 * @returns The options that apply
 *
 * @example
 * ```ts
 * mergeCallOptions({ headers: { authorization: "t" } }, { headers: { "x-id": "1" } });
 * // → { headers: { authorization: "t", "x-id": "1" } }
 * ```
 */
export function mergeCallOptions(
  options: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...options, ...next };
  if (options.headers === undefined || next.headers === undefined) return merged;
  return { ...merged, headers: layerHeaders(options.headers, next.headers) };
}
