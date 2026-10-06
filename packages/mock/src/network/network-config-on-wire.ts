import type { LatencyProfile } from "../types";
import { LATENCY_PROFILES } from "./latency";
import type { NetworkState } from "./state";

/**
 * A mock's network settings as Studio is sent them.
 *
 * A latency given by name — `"3g"`, `"wifi"` — goes out as the range it
 * stands for, so a page reads one shape, a number or a range, whatever the
 * mock was configured with.
 *
 * @param state - The mock's network state
 * @returns The settings, with the presets the page restores on reconnect
 * @example
 * ```ts
 * send({ type: "event", event: { type: "mock:network:config", config: networkConfigOnWire(state) } });
 * ```
 */
export function networkConfigOnWire(state: NetworkState): Record<string, unknown> {
  const cfg = state.getGlobalConfig();
  return {
    latency: latencyOnWire(cfg?.latency),
    errorRate: cfg?.errorRate ?? 0,
    faultWeights: cfg?.faultWeights ?? [],
    bandwidth: cfg?.bandwidth ?? 0,
    uploads: cfg?.uploads ?? {},
    distribution: cfg?.distribution ?? "uniform",
    routeOverrides: cfg?.routeOverrides ?? [],
    stopConditions: cfg?.stopConditions ?? null,
    startedAt: state.startedAt,
    latencyPreset: state.latencyPreset,
    latencyStartedAt: state.latencyStartedAt,
    chaosPreset: state.chaosPreset,
    chaosStartedAt: state.chaosStartedAt,
  };
}

function latencyOnWire(
  latency: number | LatencyProfile | undefined,
): number | { min: number; max: number; jitter?: number | undefined } {
  if (latency === undefined) return 0;
  if (typeof latency !== "string") return latency;
  return LATENCY_PROFILES[latency] ?? 0;
}
