import type { MockServerInfo, RouteOverride } from "@/store/mock-slice";
import { delayLabel, delayOf } from "./latency-window";

/** A route of the mock with its own network override, if it has one. */
export interface OverrideRow {
  routeId: string;
  method: string;
  path: string;
  name: string;
  override: RouteOverride;
  /** What the override sets of its own, short: `+300ms · 50%`, `0%`, or `global` when it sets nothing. */
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

/** A setting a route override can take over from the global ones. */
export type OverrideField = "delay" | "rate";

/**
 * Whether a route override is on and sets something of its own — a delay,
 * an error rate or faults — rather than leaving its route to the global
 * settings.
 *
 * @param override - The route's override
 * @returns Whether it overrides anything
 * @example
 * ```ts
 * hasOwnSettings({ routeId: "users:list", enabled: true, errorRate: 0 }); // true: the route never fails
 * ```
 */
export function hasOwnSettings(override: RouteOverride): boolean {
  return override.enabled && ownsAnything(override);
}

function ownsAnything({ latency, errorRate, faultTypes }: RouteOverride): boolean {
  return latency !== undefined || errorRate !== undefined || (faultTypes?.length ?? 0) > 0;
}

/**
 * A route override with one setting of its own — a fixed delay in ms, or
 * an error rate in percent — and the others as they were. Setting one
 * switches the override on.
 *
 * @param override - The route's override
 * @param field - The setting
 * @param value - Its value: ms for the delay, percent for the rate
 * @returns The override
 * @example
 * ```ts
 * withOwnField({ routeId: "users:list", enabled: false }, "delay", 300);
 * // → { routeId: "users:list", enabled: true, latency: { min: 300, max: 300, jitter: 0 } }
 * ```
 */
export function withOwnField(
  override: RouteOverride,
  field: OverrideField,
  value: number,
): RouteOverride {
  if (field === "delay") {
    return { ...override, enabled: true, latency: { min: value, max: value, jitter: 0 } };
  }
  return { ...override, enabled: true, errorRate: value / 100 };
}

/**
 * A route override that takes one setting back from the global ones. One
 * left with nothing of its own is switched off.
 *
 * @param override - The route's override
 * @param field - The setting
 * @returns The override
 * @example
 * ```ts
 * withGlobalField({ routeId: "users:list", enabled: true, errorRate: 0.5 }, "rate");
 * // → { routeId: "users:list", enabled: false }
 * ```
 */
export function withGlobalField(override: RouteOverride, field: OverrideField): RouteOverride {
  const { latency, errorRate, ...rest } = override;
  const kept: RouteOverride =
    field === "delay"
      ? { ...rest, ...(errorRate !== undefined && { errorRate }) }
      : { ...rest, ...(latency !== undefined && { latency }) };
  return { ...kept, enabled: override.enabled && ownsAnything(kept) };
}

function tagOf(override: RouteOverride): Pick<OverrideRow, "tag" | "tone"> {
  const { latency, errorRate } = override;
  const parts = [
    latency === undefined ? "" : `+${delayLabel(delayOf(latency)?.base ?? 0)}`,
    errorRate === undefined ? "" : `${Math.round(errorRate * 100)}%`,
  ].filter(Boolean);
  if (parts.length === 0) return { tag: "global", tone: "subtle" };
  return { tag: parts.join(" · "), tone: (errorRate ?? 0) > 0 ? "err" : "brand" };
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
