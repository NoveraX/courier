import type { PrefixMapping } from "../prefix-routes";

/** Resolved (group, method) pair from a WS upgrade URL */
export interface WSRoute {
  group: string;
  method: string;
}

/**
 * Resolve a request URL to a `(group, method)` pair using prefix mappings.
 *
 * Matches URLs like `/chat/room` against `{ prefix: "/chat", methods: ["room"] }`.
 * Returns null when no mapping matches the path.
 */
export function resolveWSRoute(url: string, mappings: PrefixMapping[]): WSRoute | null {
  const pathname = parsePathname(url);
  if (pathname == null) return null;

  for (const mapping of mappings) {
    const prefix = mapping.prefix.startsWith("/") ? mapping.prefix : `/${mapping.prefix}`;
    if (!pathname.startsWith(`${prefix}/`)) continue;

    const tail = pathname.slice(prefix.length + 1);
    if (!tail || tail.includes("/")) continue;

    if (mapping.methods.includes(tail)) {
      return { group: mapping.group, method: tail };
    }
  }

  return null;
}

/** Parse `?key=value` query string from a URL into a typed variables record */
export function parseVariablesFromUrl(url: string): Record<string, unknown> {
  try {
    const parsed = new URL(url, "http://localhost");
    const result: Record<string, unknown> = {};
    for (const [k, v] of parsed.searchParams) {
      const num = Number(v);
      result[k] = Number.isNaN(num) ? v : num;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Check whether an upgrade request's `Origin` header is allowed.
 *
 * - `allowlist` undefined → all origins permitted (mock dev default)
 * - `allowlist` empty array → all origins rejected
 * - `allowlist` with entries → exact match against the request `Origin` header
 *
 * Empty/missing `Origin` header is rejected when an allowlist is configured.
 */
export function isOriginAllowed(
  origin: string | undefined,
  allowlist: readonly string[] | undefined,
): boolean {
  if (allowlist === undefined) return true;
  if (!origin) return false;
  return allowlist.includes(origin);
}

function parsePathname(url: string): string | null {
  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return null;
  }
}
