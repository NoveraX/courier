import { logger } from "@noverax/courier";

import { matchPath } from "../match-path";
import type { PrefixMapping } from "../prefix-routes";
import { parseQueryParams } from "../route-helpers";

/** Resolved (group, method) pair from a WS upgrade URL */
export interface WSRoute {
  group: string;
  method: string;
  /** Parameters the endpoint's path captured (`:room` → `{ room }`) */
  params: Record<string, string>;
}

/**
 * Resolve a request URL to a `(group, method)` pair using prefix mappings.
 *
 * Matches the path after the group prefix against each WS endpoint's
 * declared path — the one a direct client connects to — so
 * `channel.connect("ws-room")` named `room` answers `/chat/ws-room`. A
 * mapping that lists only method names is matched by name.
 * Returns null when no mapping matches the path.
 */
export function resolveWSRoute(url: string, mappings: PrefixMapping[]): WSRoute | null {
  const pathname = parsePathname(url);
  if (pathname == null) return null;

  for (const mapping of mappings) {
    const prefix = mapping.prefix.startsWith("/") ? mapping.prefix : `/${mapping.prefix}`;
    if (!pathname.startsWith(`${prefix}/`)) continue;

    const tail = pathname.slice(prefix.length + 1);
    const route = mapping.endpoints ? byDeclaredPath(mapping, tail) : byName(mapping, tail);
    if (route) return route;
  }

  return null;
}

function byDeclaredPath(mapping: PrefixMapping, tail: string): WSRoute | null {
  for (const ep of mapping.endpoints ?? []) {
    if (ep.transport !== "ws") continue;
    const params = matchPath(ep.path || ep.name, tail);
    if (params) return { group: mapping.group, method: ep.name, params };
  }
  return null;
}

function byName(mapping: PrefixMapping, tail: string): WSRoute | null {
  if (!tail || tail.includes("/") || !mapping.methods.includes(tail)) return null;
  return { group: mapping.group, method: tail, params: {} };
}

/**
 * Parse the `?key=value` query of an upgrade URL into variables, by the rule
 * the HTTP routes follow: a value written as a number becomes one, and any
 * other — `"007"`, `""`, `"1e3"` — stays the string it is.
 *
 * @param url - The upgrade request's URL, absolute or a path
 * @returns The query's variables
 * @example
 * ```ts
 * parseVariablesFromUrl("/rt/room?code=007&id=12"); // { code: "007", id: 12 }
 * ```
 */
export function parseVariablesFromUrl(url: string): Record<string, unknown> {
  try {
    return parseQueryParams(new URL(url, "http://localhost").searchParams);
  } catch (error) {
    logger.debug("MockWS", `Unreadable upgrade URL "${url}"`, error);
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
