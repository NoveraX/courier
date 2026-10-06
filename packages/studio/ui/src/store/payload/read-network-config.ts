import { isPlainObject } from "@/socket/is-plain-object";
import type {
  FaultWeight,
  NetworkConfig,
  RouteOverride,
  StopCondition,
  UploadConditions,
} from "../mock-slice-network-types";
import { readList } from "./read-list";
import { readNumbers } from "./read-numbers";
import { readOneOf } from "./read-one-of";
import { readUploads } from "./read-uploads";

const DISTRIBUTIONS = ["uniform", "normal", "log-normal"] as const;
const STOP_NUMBERS = [
  "errorRateThreshold",
  "errorRateDurationSecs",
  "p99Threshold",
  "p99DurationSecs",
  "maxDurationMins",
] as const;

/* The mock sends a range's shape beside it, as `distribution`; the page keeps it in the range. */
function readLatency(value: unknown, shapeBeside: unknown): NetworkConfig["latency"] | undefined {
  if (typeof value === "number") return value;
  const range = readNumbers(value, ["min", "max"] as const);
  if (!range || !isPlainObject(value)) return undefined;
  const { jitter } = value;
  const distribution = value.distribution ?? shapeBeside;
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
  const uploads = value.uploads === undefined ? undefined : readUploads(value.uploads);
  if (value.uploads !== undefined && uploads === undefined) return undefined;
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
    ...(uploads && routeUploads(uploads)),
  };
}

/* A route takes the mock's upload speed, so its own conditions are its size limit and types. */
function routeUploads({ maxBytes, accept }: UploadConditions): Pick<RouteOverride, "uploads"> {
  if (maxBytes === undefined && accept === undefined) return {};
  return {
    uploads: { ...(maxBytes !== undefined && { maxBytes }), ...(accept && { accept }) },
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
  const latency = readLatency(value.latency, value.distribution);
  const { errorRate, faultWeights, bandwidth, stopConditions, routeOverrides } = value;
  if (latency === undefined || typeof errorRate !== "number") return undefined;
  const uploads = value.uploads === undefined ? undefined : readUploads(value.uploads);
  if (value.uploads !== undefined && uploads === undefined) return undefined;
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
    ...(uploads && { uploads }),
    ...(stops !== undefined && { stopConditions: stops }),
    ...(overrides && { routeOverrides: overrides }),
  };
}
