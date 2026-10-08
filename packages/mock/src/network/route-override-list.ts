import type { NetworkConfig, RouteNetworkOverride } from "../types";
import { readRouteOverride } from "./command-patch";

/**
 * The change a command makes to the route overrides when it names one
 * route's override as `routeOverride`: that override in place of the
 * route's, the others as they were. Each Studio page sends the one route it
 * changed, so two pages changing two routes never undo each other.
 *
 * @param config - The command's `config`
 * @param current - The overrides the change applies to
 * @returns The overrides to merge, or nothing when the command names none
 * @example
 * ```ts
 * routeOverridePatch({ routeOverride: { routeId: "users:list", enabled: true, errorRate: 1 } }, []);
 * // { routeOverrides: [{ routeId: "users:list", enabled: true, errorRate: 1 }] }
 * ```
 */
export function routeOverridePatch(
  config: unknown,
  current: readonly RouteNetworkOverride[] | undefined,
): Partial<NetworkConfig> {
  if (typeof config !== "object" || config === null || !("routeOverride" in config)) return {};
  const override = readRouteOverride(config.routeOverride);
  if (override === undefined) return {};
  return { routeOverrides: withRouteOverride(current ?? [], override) };
}

/**
 * The overrides with one route's in place of the one it had, or added. An
 * override switched off with nothing of its own leaves the list: the route
 * has nothing to keep.
 *
 * @param overrides - The overrides
 * @param override - The route's override
 * @returns The overrides
 * @example
 * ```ts
 * withRouteOverride(overrides, { routeId: "users:list", enabled: false }); // users:list removed
 * ```
 */
export function withRouteOverride(
  overrides: readonly RouteNetworkOverride[],
  override: RouteNetworkOverride,
): RouteNetworkOverride[] {
  const keep = override.enabled || setsAnything(override);
  const at = overrides.findIndex((each) => each.routeId === override.routeId);
  if (at === -1) return keep ? [...overrides, override] : [...overrides];
  if (!keep) return overrides.filter((_, index) => index !== at);
  return overrides.map((each, index) => (index === at ? override : each));
}

/**
 * Every override switched off, each keeping its settings — what a halt or
 * Stop all leaves, so the routes can be switched back on as they were.
 *
 * @param overrides - The overrides
 * @returns The overrides, switched off
 * @example
 * ```ts
 * switchedOff([{ routeId: "users:list", enabled: true, errorRate: 1 }]);
 * // [{ routeId: "users:list", enabled: false, errorRate: 1 }]
 * ```
 */
export function switchedOff(overrides: readonly RouteNetworkOverride[]): RouteNetworkOverride[] {
  return overrides.map((override) => ({ ...override, enabled: false }));
}

/**
 * Whether a route override sets anything of its own, on or off: a delay,
 * an error rate (0 included — the route then never fails), faults or an
 * upload rule.
 *
 * @param override - The override
 * @returns Whether it sets something
 * @example
 * ```ts
 * setsAnything({ routeId: "users:list", enabled: false, errorRate: 0 }); // true
 * ```
 */
export function setsAnything(override: RouteNetworkOverride): boolean {
  const { latency, errorRate, faultTypes, uploads } = override;
  if (latency !== undefined || errorRate !== undefined || (faultTypes?.length ?? 0) > 0)
    return true;
  return uploads?.maxBytes !== undefined || uploads?.accept !== undefined;
}
