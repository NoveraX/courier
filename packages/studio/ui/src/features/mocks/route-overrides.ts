import type { MockServerInfo, RouteOverride } from "@/store/mock-slice";
import { delayLabel, delayOf } from "./latency-window";
import { sizeLimitLabel } from "./upload-conditions";

/** A route of the mock with its own network override, if it has one. */
export interface OverrideRow {
  routeId: string;
  method: string;
  path: string;
  name: string;
  override: RouteOverride;
  /** What the override sets of its own, short: `+300ms · 50% · 413`, `≤ 1 MB`, or `global` when it sets nothing. */
  tag: string;
  tone: "err" | "brand" | "subtle";
}

/**
 * Every route override the mock holds, switched on or off — the mock keeps
 * them all, so every page, a reload and a restart of Studio show the same.
 *
 * @param server - The mock server
 * @returns The overrides, one per route
 * @example
 * ```ts
 * routeOverridesOf(server).filter((o) => o.enabled);
 * ```
 */
export function routeOverridesOf(server: Pick<MockServerInfo, "networkConfig">): RouteOverride[] {
  return server.networkConfig?.routeOverrides ?? [];
}

/**
 * The overrides with one route's in place of the one it had, or added, as
 * the mock takes a route's override: one switched off with nothing of its
 * own leaves the list.
 *
 * @param overrides - The overrides
 * @param override - The route's override
 * @returns The overrides
 * @example
 * ```ts
 * withRouteOverride(routeOverridesOf(server), { routeId: "users:list", enabled: true, errorRate: 0 });
 * ```
 */
export function withRouteOverride(
  overrides: readonly RouteOverride[],
  override: RouteOverride,
): RouteOverride[] {
  const keep = override.enabled || setsAnything(override);
  const at = overrides.findIndex((each) => each.routeId === override.routeId);
  if (at === -1) return keep ? [...overrides, override] : [...overrides];
  if (!keep) return overrides.filter((_, index) => index !== at);
  return overrides.map((each, index) => (index === at ? override : each));
}

/** A setting a route override can take over from the global ones. */
export type OverrideField = "delay" | "rate";

/**
 * Whether a route override is on and sets something of its own — a delay,
 * an error rate, faults, a size limit or types of file — rather than
 * leaving its route to the global settings.
 *
 * @param override - The route's override
 * @returns Whether it overrides anything
 * @example
 * ```ts
 * hasOwnSettings({ routeId: "users:list", enabled: true, errorRate: 0 }); // true: the route never fails
 * ```
 */
export function hasOwnSettings(override: RouteOverride): boolean {
  return override.enabled && setsAnything(override);
}

/**
 * Whether a route override sets anything of its own, on or off: a delay,
 * an error rate, faults, a size limit or types of file.
 *
 * @param override - The route's override
 * @returns Whether it sets something
 * @example
 * ```ts
 * setsAnything({ routeId: "users:avatar", enabled: false, uploads: { maxBytes: 1024 } }); // true
 * ```
 */
export function setsAnything({ latency, errorRate, faultTypes, uploads }: RouteOverride): boolean {
  if (latency !== undefined || errorRate !== undefined || (faultTypes?.length ?? 0) > 0)
    return true;
  return uploads?.maxBytes !== undefined || uploads?.accept !== undefined;
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
  return { ...kept, enabled: override.enabled && setsAnything(kept) };
}

function tagOf(override: RouteOverride): Pick<OverrideRow, "tag" | "tone"> {
  const { latency, errorRate, faultTypes, uploads } = override;
  const parts = [
    latency === undefined ? "" : `+${delayLabel(delayOf(latency)?.base ?? 0)}`,
    errorRate === undefined ? "" : `${Math.round(errorRate * 100)}%`,
    faultTypes?.join(", ") ?? "",
    uploads?.maxBytes === undefined ? "" : `≤ ${sizeLimitLabel(uploads.maxBytes)}`,
    uploads?.accept === undefined ? "" : uploads.accept.join(", ") || "any type",
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
  server: Pick<MockServerInfo, "routes" | "networkConfig">,
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
