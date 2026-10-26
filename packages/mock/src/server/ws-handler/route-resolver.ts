import { logger } from "@noverax/courier";

import { carriesFixedQuery } from "../fixed-query";
import { matchPath } from "../match-path";
import type { MappedEndpoint, PrefixMapping } from "../prefix-route-types";
import { parseQueryParams } from "../route-helpers";
import { byRouteOrder } from "../route-order";

/* A channel is matched at its path, or at its name when it declares none. */
const routedAt = (ep: MappedEndpoint): string => ep.path || ep.name;
const BY_ROUTE = byRouteOrder(routedAt);
/* Each mapping's channels in the order they are tried, sorted once: a channel is matched on every connection. */
const CHANNELS = new WeakMap<PrefixMapping, readonly MappedEndpoint[]>();

/** Resolved (group, method) pair from a WS upgrade URL */
export interface WSRoute {
  group: string;
  method: string;
  /** Parameters the endpoint's path captured (`:room` → `{ room }`) */
  params: Record<string, string>;
  /** Query values the endpoint's path fixes, which its variables leave out */
  fixedQuery?: Readonly<Record<string, string>> | undefined;
}

/**
 * Resolve a request URL to a `(group, method)` pair using prefix mappings.
 *
 * Matches the path after the group prefix against each WS endpoint's
 * declared path — the one a direct client connects to — so
 * `channel.connect("ws-room")` named `room` answers `/chat/ws-room`. A
 * query the path writes is matched as an HTTP endpoint's is: the path before
 * it routes, and the channel answers only a request that carries the
 * query's values. The channels are tried in the order an HTTP endpoint's
 * routes are — `chat/:id` before `chat/{+name}` — whatever order declares
 * them. A mapping that lists only method names is matched by name.
 * Returns null when no mapping matches the path.
 */
export function resolveWSRoute(url: string, mappings: PrefixMapping[]): WSRoute | null {
  const pathname = requestPath(url);
  if (pathname == null) return null;

  for (const mapping of mappings) {
    const prefix = mapping.prefix.startsWith("/") ? mapping.prefix : `/${mapping.prefix}`;
    if (!pathname.startsWith(`${prefix}/`)) continue;

    const tail = pathname.slice(prefix.length + 1);
    const route = mapping.endpoints ? byDeclaredPath(mapping, tail, url) : byName(mapping, tail);
    if (route) return route;
  }

  return null;
}

function byDeclaredPath(mapping: PrefixMapping, tail: string, url: string): WSRoute | null {
  for (const ep of channelsOf(mapping)) {
    if (!carriesFixedQuery(url, ep.fixedQuery)) continue;
    const params = matchPath(routedAt(ep), tail);
    if (!params) continue;
    const { fixedQuery } = ep;
    return { group: mapping.group, method: ep.name, params, ...(fixedQuery && { fixedQuery }) };
  }
  return null;
}

function channelsOf(mapping: PrefixMapping): readonly MappedEndpoint[] {
  const known = CHANNELS.get(mapping);
  if (known) return known;
  const channels = (mapping.endpoints ?? []).filter((ep) => ep.transport === "ws").sort(BY_ROUTE);
  CHANNELS.set(mapping, channels);
  return channels;
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

/**
 * The path an upgrade request asks for, without its query.
 *
 * @param url - The request's URL, as `req.url` gives it
 * @returns The path, or `null` for a URL that cannot be read
 * @example
 * ```ts
 * requestPath("/api/ws?token=abc"); // → "/api/ws"
 * ```
 */
export function requestPath(url: string): string | null {
  return URL.canParse(url, "http://localhost") ? new URL(url, "http://localhost").pathname : null;
}
