import type { NetworkConfig, RouteNetworkOverride } from "../types";

/**
 * Whether a network config simulates anything: errors or latency.
 *
 * @param config - The config
 * @returns Whether it changes how requests are answered
 * @example
 * ```ts
 * isActive({ errorRate: 0.1 }); // → true
 * ```
 */
export function isActive(config: NetworkConfig): boolean {
  return (config.errorRate ?? 0) > 0 || hasLatency(config);
}

/**
 * Whether a network config delays answers.
 *
 * @param config - The config
 * @returns Whether it adds latency
 * @example
 * ```ts
 * hasLatency({ latency: { min: 100, max: 300 } }); // → true
 * ```
 */
export function hasLatency(config: NetworkConfig): boolean {
  if (!config.latency) return false;
  if (typeof config.latency === "number") return config.latency > 0;
  if (typeof config.latency === "string") return true;
  return config.latency.max > 0;
}

/**
 * The enabled override for one route, if any.
 *
 * @param overrides - The route overrides
 * @param group - The route's group
 * @param endpoint - The route's endpoint
 * @returns The override, or `undefined`
 * @example
 * ```ts
 * findRouteOverride(overrides, "users", "list");
 * ```
 */
export function findRouteOverride(
  overrides: RouteNetworkOverride[],
  group: string,
  endpoint: string,
): RouteNetworkOverride | undefined {
  return overrides.find((o) => o.enabled && o.routeId === `${group}:${endpoint}`);
}

/**
 * A route override laid over the global config; the override's fields win.
 *
 * @param global - The global config
 * @param override - The route's override
 * @returns The config the route is answered with
 * @example
 * ```ts
 * mergeOverride({ errorRate: 0 }, { routeId: "users:list", enabled: true, errorRate: 1 });
 * ```
 */
export function mergeOverride(
  global: NetworkConfig,
  override: RouteNetworkOverride,
): NetworkConfig {
  return {
    ...global,
    latency: override.latency ?? global.latency,
    errorRate: override.errorRate !== undefined ? override.errorRate / 100 : global.errorRate,
    faultTypes: override.faultTypes?.length
      ? override.faultTypes.filter(isFaultType)
      : global.faultTypes,
    // Clear route overrides so we don't recurse
    routeOverrides: undefined,
  };
}

type FaultType = NonNullable<NetworkConfig["faultTypes"]>[number];

const FAULT_TYPES: ReadonlySet<string> = new Set(["500", "502", "503", "timeout", "reset"]);

/* An override comes from Studio as text; only a fault the mock simulates is kept. */
function isFaultType(value: string): value is FaultType {
  return FAULT_TYPES.has(value);
}
