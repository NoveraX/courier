import type { NetworkConfig, RouteNetworkOverride, UploadConditions } from "../types";
import { isFaultType } from "./failure";

/**
 * Whether a network config simulates anything: errors, latency, a
 * bandwidth cap, upload conditions, or a route override that fails, delays
 * or limits the uploads of its route.
 *
 * @param config - The config
 * @returns Whether it changes how requests are answered
 * @example
 * ```ts
 * isActive({ errorRate: 0.1 }); // → true
 * isActive({ uploads: { maxBytes: 1_048_576 } }); // → true
 * ```
 */
export function isActive(config: NetworkConfig): boolean {
  if ((config.errorRate ?? 0) > 0 || hasLatency(config) || (config.bandwidth ?? 0) > 0) return true;
  if (limitsUploads(config.uploads) || (config.uploads?.bandwidth ?? 0) > 0) return true;
  return config.routeOverrides?.some(overrideSimulates) ?? false;
}

function overrideSimulates(override: RouteNetworkOverride): boolean {
  if (!override.enabled) return false;
  const fails = (override.errorRate ?? 0) > 0 || (override.latency?.max ?? 0) > 0;
  return fails || limitsUploads(override.uploads);
}

/* A size limit or a list of types refuses some uploads; a speed alone refuses none. */
function limitsUploads(uploads: UploadConditions | undefined): boolean {
  return uploads?.maxBytes !== undefined || (uploads?.accept?.length ?? 0) > 0;
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
 * The config one route is answered with: the global config, with the
 * route's enabled override laid over it when it has one.
 *
 * @param config - The global config
 * @param group - The route's group
 * @param endpoint - The route's endpoint
 * @returns The route's config
 * @example
 * ```ts
 * routeConfigOf(config, "users", "list").errorRate;
 * ```
 */
export function routeConfigOf(
  config: NetworkConfig,
  group: string,
  endpoint: string,
): NetworkConfig {
  const overrides = config.routeOverrides;
  const override = overrides?.length ? findRouteOverride(overrides, group, endpoint) : undefined;
  return override ? mergeOverride(config, override) : config;
}

/**
 * A route override laid over the global config; the override's fields win.
 * Faults it names replace the global mix, weighted or not, so its own
 * `faultTypes` are the ones its failures take. Its upload limit and types
 * each replace the global one; the upload speed stays the global one.
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
    errorRate: override.errorRate ?? global.errorRate,
    ...(override.faultTypes?.length
      ? { faultTypes: override.faultTypes.filter(isFaultType), faultWeights: undefined }
      : {}),
    uploads: uploadsOver(global.uploads, override.uploads),
    // Clear route overrides so we don't recurse
    routeOverrides: undefined,
  };
}

/* Each upload rule the route sets replaces the global one; the rest stay. */
function uploadsOver(
  global: UploadConditions | undefined,
  own: RouteNetworkOverride["uploads"],
): UploadConditions | undefined {
  if (own === undefined) return global;
  return {
    ...global,
    ...(own.maxBytes !== undefined && { maxBytes: own.maxBytes }),
    ...(own.accept !== undefined && { accept: own.accept }),
  };
}
