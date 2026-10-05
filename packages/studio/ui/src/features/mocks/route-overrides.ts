import type { MockServerInfo, RouteOverride } from "@/store/mock-slice";
import { delayLabel, delayOf } from "./latency-window";

/** A route of the mock with its own network override, if it has one. */
export interface OverrideRow {
  routeId: string;
  method: string;
  path: string;
  name: string;
  override: RouteOverride;
  /** What the override does, short: `+300ms · 50%`, or `global` when it does nothing. */
  tag: string;
  tone: "err" | "brand" | "subtle";
}

/**
 * Every route override the mock knows of: the ones set on this page, and
 * the ones the mock already held when the page opened.
 *
 * @param server - The mock server
 * @returns The overrides, one per route
 * @example
 * ```ts
 * routeOverridesOf(server).filter((o) => o.enabled);
 * ```
 */
export function routeOverridesOf(
  server: Pick<MockServerInfo, "routeOverrides" | "networkConfig">,
): RouteOverride[] {
  const local = server.routeOverrides ?? [];
  const known = new Set(local.map((o) => o.routeId));
  return [
    ...local,
    ...(server.networkConfig?.routeOverrides ?? []).filter((o) => !known.has(o.routeId)),
  ];
}

/**
 * Whether a route override changes how its route is answered: it is on,
 * and adds a delay or fails a share of the route's answers.
 *
 * @param override - The route's override
 * @returns Whether it simulates anything
 * @example
 * ```ts
 * simulates({ routeId: "users:list", enabled: true, errorRate: 0.5 }); // true
 * ```
 */
export function simulates(override: RouteOverride): boolean {
  return override.enabled && (delayOf(override.latency) !== null || (override.errorRate ?? 0) > 0);
}

function tagOf(override: RouteOverride): Pick<OverrideRow, "tag" | "tone"> {
  const delay = delayOf(override.latency);
  const rate = Math.round((override.errorRate ?? 0) * 100);
  const parts = [delay ? `+${delayLabel(delay.base)}` : "", rate ? `${rate}%` : ""].filter(Boolean);
  if (parts.length === 0) return { tag: "global", tone: "subtle" };
  return { tag: parts.join(" · "), tone: rate ? "err" : "brand" };
}

/**
 * The mock's routes as the Per-route overrides card lists them, each with
 * its override — switched off and empty for a route that has none.
 *
 * @param server - The mock server
 * @returns One row per route, in the mock's order
 * @example
 * ```ts
 * overrideRows(server)[0]; // { routeId: "users:list", method: "GET", tag: "+300ms", … }
 * ```
 */
export function overrideRows(
  server: Pick<MockServerInfo, "routes" | "routeOverrides" | "networkConfig">,
): OverrideRow[] {
  const overrides = new Map(routeOverridesOf(server).map((o) => [o.routeId, o]));
  return server.routes.map((route) => {
    const routeId = `${route.group}:${route.endpoint}`;
    const override = overrides.get(routeId) ?? { routeId, enabled: false };
    return {
      routeId,
      method: route.httpMethod.toUpperCase(),
      path: route.fullPath || route.path || `/${route.endpoint}`,
      name: route.group ? `${route.group}.${route.endpoint}` : route.endpoint,
      override,
      ...tagOf(override),
    };
  });
}
