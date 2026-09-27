/**
 * Lay one set of request headers over another.
 *
 * A name present in both takes its value from `over`; every other header of
 * either set is kept. Nothing is filtered: both sets were written by the
 * application, not received from a browser.
 *
 * @param base - Headers that apply unless something more specific names them
 * @param over - Headers that win where both name the same header
 * @returns A new `Headers` holding the combination
 *
 * @example
 * ```ts
 * overlayHeaders({ "x-api-key": "k", accept: "text/plain" }, { accept: "application/json" });
 * // → x-api-key: k, accept: application/json
 * ```
 */
export function overlayHeaders(base?: HeadersInit, over?: HeadersInit): Headers {
  const merged = new Headers(base);
  new Headers(over).forEach((value, name) => {
    merged.set(name, value);
  });
  return merged;
}
