/** A declared path, and the query values it fixes after `?`. */
export interface SplitPath {
  /** The path alone. */
  path: string;
  /** The query as written, without its `?`; `""` when the path fixes none. */
  query: string;
  /** The values it fixes, by name; `undefined` when it fixes none. */
  fixed: Readonly<Record<string, string>> | undefined;
}

/**
 * Split a declared path at the query it fixes: a specification may write
 * `/responses?beta=true` to tell two operations at one path apart. A client
 * sends the query as it is; a mock routes by the path and answers only a
 * request that carries the values.
 *
 * @param declared - The path as the endpoint declares it
 * @returns The path, and the query it fixes
 * @example
 * ```ts
 * splitQuery("responses/:id?beta=true"); // { path: "responses/:id", query: "beta=true", fixed: { beta: "true" } }
 * ```
 */
export function splitQuery(declared: string): SplitPath {
  const at = declared.indexOf("?");
  if (at === -1) return { path: declared, query: "", fixed: undefined };
  const query = declared.slice(at + 1);
  const fixed = Object.fromEntries(new URLSearchParams(query));
  return {
    path: declared.slice(0, at),
    query,
    fixed: Object.keys(fixed).length > 0 ? fixed : undefined,
  };
}
