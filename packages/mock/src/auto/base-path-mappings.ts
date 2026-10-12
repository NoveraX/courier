import { withoutTrailingSlashes } from "@noverax/courier/internal";

import type { PrefixMapping } from "../server/prefix-route-types";
import { prop } from "./schema-introspect/prop";

const LEADING_SLASHES = /^\/+/;

/**
 * The groups' mappings, and the same again under the path the source's
 * `baseURL` has, when it has one.
 *
 * A source at `https://api.example.com/api/v3` is called at
 * `/api/v3/users`. A client pointed at the mock with only the host swapped
 * calls the mock there, and one pointed at the mock's bare URL calls
 * `/users`; the mock answers both, over HTTP, SSE and WebSocket alike.
 *
 * @param mappings - The groups' mappings, at their prefixes
 * @param source - The source the mock serves
 * @returns The mappings to serve
 * @example
 * ```ts
 * withBasePath([{ prefix: "/users", group: "users", methods: ["list"] }], api);
 * // → the /users mapping, and one at /api/v3/users for a baseURL ending in /api/v3
 * ```
 */
export function withBasePath(
  mappings: PrefixMapping[],
  source: Record<string, unknown>,
): PrefixMapping[] {
  const base = basePathOf(prop(source, "options", "baseURL"));
  if (base === undefined) return mappings;
  const underBase = mappings.map((mapping) => {
    const prefix = mapping.prefix.replace(LEADING_SLASHES, "");
    return { ...mapping, prefix: prefix === "" ? base : `${base}/${prefix}` };
  });
  return [...mappings, ...underBase];
}

/* A relative baseURL ("/api") has a path as much as an absolute one does. */
function basePathOf(baseURL: unknown): string | undefined {
  if (typeof baseURL !== "string" || !URL.canParse(baseURL, "http://base.invalid")) {
    return undefined;
  }
  const path = withoutTrailingSlashes(new URL(baseURL, "http://base.invalid").pathname);
  return path === "" ? undefined : path;
}
