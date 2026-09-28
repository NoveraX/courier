/** The endpoint a proxy call names: its source, its group, and its method. */
export interface ProxyRouting {
  source: string;
  group: string | undefined;
  method: string;
}

/**
 * Read which endpoint a proxy call is for, from its URL.
 *
 * Every proxy call names its endpoint in the query — `_s`, `_g`, `_m` — a
 * POST as much as a GET. A POST once carried the names inside its body,
 * where a multipart upload put them after the files, so the proxy learned
 * which endpoint an upload was for only once all of it had arrived: nothing
 * could say that an upload was under way, or which call a 413 refused.
 *
 * @param url - The proxy request's URL
 * @returns The endpoint, or `undefined` when the source or the method is missing
 *
 * @example
 * ```ts
 * readRouting(new URL("https://app.example.com/api/request?_s=api&_g=users&_m=create"));
 * // → { source: "api", group: "users", method: "create" }
 * ```
 */
export function readRouting(url: URL): ProxyRouting | undefined {
  const source = url.searchParams.get("_s");
  const method = url.searchParams.get("_m");
  if (!source || !method) return undefined;
  return { source, group: url.searchParams.get("_g") || undefined, method };
}
