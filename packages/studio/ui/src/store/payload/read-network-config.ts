import { isPlainObject } from "@/socket/is-plain-object";
import type {
  FaultWeight,
  NetworkConfig,
  RouteOverride,
  StopCondition,
} from "../mock-slice-network-types";
import { readList } from "./read-list";
import { readNumbers } from "./read-numbers";
import { readOneOf } from "./read-one-of";

const DISTRIBUTIONS = ["uniform", "normal", "log-normal"] as const;
const STOP_NUMBERS = [
  "errorRateThreshold",
  "errorRateDurationSecs",
  "p99Threshold",
  "p99DurationSecs",
  "maxDurationMins",
] as const;

function readLatency(value: unknown): NetworkConfig["latency"] | undefined {
  if (typeof value === "number") return value;
  const range = readNumbers(value, ["min", "max"] as const);
  if (!range || !isPlainObject(value)) return undefined;
  const { jitter, distribution } = value;
  if (jitter !== undefined && typeof jitter !== "number") return undefined;
  const shape = distribution === undefined ? undefined : readOneOf(distribution, DISTRIBUTIONS);
  if (distribution !== undefined && shape === undefined) return undefined;
  return {
    ...range,
    ...(jitter !== undefined && { jitter }),
    ...(shape && { distribution: shape }),
  };
}

function isFaultWeight(value: unknown): value is FaultWeight {
  return isPlainObject(value) && typeof value.type === "string" && typeof value.weight === "number";
}

function isStopCondition(value: unknown): value is StopCondition {
  return (
    isPlainObject(value) &&
    typeof value.enabled === "boolean" &&
    readNumbers(value, STOP_NUMBERS) !== undefined
  );
}

/* A route's latency may leave out its jitter, which is then none. */
function readRouteOverride(value: unknown): RouteOverride | undefined {
  if (!isPlainObject(value)) return undefined;
  const { routeId, enabled, latency, errorRate, faultTypes } = value;
  if (typeof routeId !== "string" || typeof enabled !== "boolean") return undefined;
  const range = latency === undefined ? undefined : readNumbers(latency, ["min", "max"] as const);
  if (latency !== undefined && (range === undefined || !isPlainObject(latency))) return undefined;
  const jitter = isPlainObject(latency) && typeof latency.jitter === "number" ? latency.jitter : 0;
  const faults =
    faultTypes === undefined
      ? undefined
      : readList(faultTypes, (item): item is string => typeof item === "string");
  if (faultTypes !== undefined && faults === undefined) return undefined;
  if (errorRate !== undefined && typeof errorRate !== "number") return undefined;
  return {
    routeId,
    enabled,
    ...(range && { latency: { ...range, jitter } }),
    ...(typeof errorRate === "number" && { errorRate }),
    ...(faults && { faultTypes: faults }),
  };
}

function readRouteOverrides(value: unknown): RouteOverride[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: unknown[] = value;
  const overrides: RouteOverride[] = [];
  for (const item of items) {
    const override = readRouteOverride(item);
    if (override === undefined) return undefined;
    overrides.push(override);
  }
  return overrides;
}

/**
 * A mock's network settings from a socket event, or `undefined`.
 *
 * @param value - The field as the socket parsed it
 * @returns The settings, or `undefined` when any part has another shape
 * @example
 * ```ts
 * readNetworkConfig({ latency: { min: 300, max: 900 }, errorRate: 0 });
 * ```
 */
export function readNetworkConfig(value: unknown): NetworkConfig | undefined {
  if (!isPlainObject(value)) return undefined;
  const latency = readLatency(value.latency);
  const { errorRate, faultWeights, bandwidth, stopConditions, routeOverrides } = value;
  if (latency === undefined || typeof errorRate !== "number") return undefined;
  const weights = faultWeights === undefined ? undefined : readList(faultWeights, isFaultWeight);
  const overrides = routeOverrides === undefined ? undefined : readRouteOverrides(routeOverrides);
  if (faultWeights !== undefined && weights === undefined) return undefined;
  if (routeOverrides !== undefined && overrides === undefined) return undefined;
  if (bandwidth !== undefined && typeof bandwidth !== "number") return undefined;
  /* The mock sends `null` for no stop conditions. */
  const stops = stopConditions === null ? undefined : stopConditions;
  if (stops !== undefined && !isStopCondition(stops)) return undefined;
  return {
    latency,
    errorRate,
    ...(weights && { faultWeights: weights }),
    ...(typeof bandwidth === "number" && { bandwidth }),
    ...(stops !== undefined && { stopConditions: stops }),
    ...(overrides && { routeOverrides: overrides }),
  };
}
