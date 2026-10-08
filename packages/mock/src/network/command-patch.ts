import type {
  FaultWeight,
  LatencyDistribution,
  LatencyProfile,
  NetworkConfig,
  RouteNetworkOverride,
  StopCondition,
} from "../types";
import { isFaultType } from "./failure";
import { readRouteUploads, readUploads } from "./read-uploads";

type Patch = Partial<NetworkConfig>;
type Fields = Record<string, unknown>;

const LATENCY_PRESETS = new Set(["3g", "4g", "wifi", "fiber"]);
const DISTRIBUTIONS = new Set<string>(["uniform", "normal", "log-normal"]);
const STOP_FIELDS = [
  "errorRateThreshold",
  "errorRateDurationSecs",
  "p99Threshold",
  "p99DurationSecs",
  "maxDurationMins",
] as const;

/* Each key a command may name, and how its value is read. A key the
   command leaves out is left out of the patch, so it keeps its value. */
const READERS: Array<[string, (value: unknown) => Patch]> = [
  ["latency", latencyPatch],
  ["bandwidth", (value) => ({ bandwidth: numberOr(value, 0) })],
  ["uploads", (value) => ({ uploads: readUploads(value) })],
  ["errorRate", (value) => ({ errorRate: numberOr(value, 0) })],
  ["faultWeights", (value) => ({ faultWeights: listOf(value, faultWeightOf) })],
  ["routeOverrides", (value) => ({ routeOverrides: listOf(value, readRouteOverride) })],
  ["stopConditions", (value) => ({ stopConditions: stopConditionOf(value) })],
];

/**
 * The change a Studio network or chaos command makes to the network config.
 *
 * Only the keys the command names are in the patch. Studio's controls each
 * send their own part — a latency preset its latency, a per-route override
 * its overrides — and merging the others as `undefined` switched off
 * whatever else was active. A key named with an empty value (`latency: 0`)
 * is in the patch as `undefined`, which turns that setting off.
 *
 * @param config The `config` of a `mock:network:set` or `mock:chaos:set` command
 * @returns The fields to merge into the network config
 * @example
 * ```ts
 * networkCommandPatch({ routeOverrides: [] }); // { routeOverrides: [] }
 * networkCommandPatch({ latency: 0 });         // { latency: undefined }
 * ```
 */
export function networkCommandPatch(config: unknown): Patch {
  let patch: Patch = {};
  if (!isFields(config)) return patch;
  for (const [key, read] of READERS) {
    if (Object.hasOwn(config, key)) patch = { ...patch, ...read(config[key]) };
  }
  return patch;
}

function latencyPatch(value: unknown): Patch {
  const distribution = isFields(value) ? value.distribution : undefined;
  const latency = { latency: latencyOf(value) };
  return isDistribution(distribution) ? { ...latency, distribution } : latency;
}

function latencyOf(value: unknown): number | LatencyProfile | undefined {
  if (typeof value === "number") return value > 0 ? { min: value, max: value } : undefined;
  if (typeof value === "string") return isLatencyPreset(value) ? value : undefined;
  if (!isFields(value)) return undefined;
  const min = numberOr(value.min, 0);
  const max = numberOr(value.max, 0);
  if (min === 0 && max === 0) return undefined;
  const jitter = typeof value.jitter === "number" ? value.jitter : undefined;
  return jitter === undefined ? { min, max } : { min, max, jitter };
}

function faultWeightOf(value: unknown): FaultWeight | undefined {
  if (!isFields(value) || typeof value.type !== "string") return undefined;
  return { type: value.type, weight: numberOr(value.weight, 0) };
}

/**
 * A route override as a command sends it, read for its shape: its route
 * and whether it is on, and each setting of its own the command gives —
 * a delay range, a rate, faults the mock knows, upload rules.
 *
 * @param value - The override as the command carried it
 * @returns The override, or `undefined` when it names no route
 * @example
 * ```ts
 * readRouteOverride({ routeId: "users:list", enabled: true, errorRate: 0 });
 * ```
 */
export function readRouteOverride(value: unknown): RouteNetworkOverride | undefined {
  if (!isFields(value) || typeof value.routeId !== "string") return undefined;
  const override: RouteNetworkOverride = {
    routeId: value.routeId,
    enabled: value.enabled === true,
  };
  const latency = latencyOf(value.latency);
  if (typeof latency === "object") override.latency = latency;
  if (typeof value.errorRate === "number") override.errorRate = value.errorRate;
  if (Array.isArray(value.faultTypes)) {
    const types: unknown[] = value.faultTypes;
    override.faultTypes = types.filter((type) => typeof type === "string").filter(isFaultType);
  }
  const uploads = readRouteUploads(value.uploads);
  if (uploads) override.uploads = uploads;
  return override;
}

function stopConditionOf(value: unknown): StopCondition | undefined {
  if (!isFields(value)) return undefined;
  const condition: StopCondition = {
    enabled: value.enabled === true,
    errorRateThreshold: 0,
    errorRateDurationSecs: 0,
    p99Threshold: 0,
    p99DurationSecs: 0,
    maxDurationMins: 0,
  };
  for (const field of STOP_FIELDS) condition[field] = numberOr(value[field], 0);
  return condition;
}

function listOf<TItem>(value: unknown, read: (item: unknown) => TItem | undefined): TItem[] {
  if (!Array.isArray(value)) return [];
  return value.map(read).filter((item): item is TItem => item !== undefined);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isDistribution(value: unknown): value is LatencyDistribution {
  return typeof value === "string" && DISTRIBUTIONS.has(value);
}

function isLatencyPreset(value: string): value is Extract<LatencyProfile, string> {
  return LATENCY_PRESETS.has(value);
}

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
