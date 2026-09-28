/**
 * The query that names a proxy call's endpoint — `_s`, `_g`, `_m` — which a
 * POST carries in its URL as a GET does.
 *
 * In the URL, the proxy knows which call an upload is for before its body
 * arrives, so Studio can show it while it uploads and say which call a 413
 * refused; and a caller's own form field can never be taken for the name.
 *
 * @param source - The source's registry name
 * @param group - The group, when the endpoint has one
 * @param method - The endpoint's name
 * @returns The query parameters
 *
 * @example
 * ```ts
 * proxyRouting("api", "users", "create"); // → { _s: "api", _g: "users", _m: "create" }
 * ```
 */
export function proxyRouting(
  source: string,
  group: string | undefined,
  method: string,
): Record<string, string> {
  return group ? { _s: source, _g: group, _m: method } : { _s: source, _m: method };
}
