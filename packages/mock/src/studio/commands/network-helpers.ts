/**
 * Helpers shared between the network and chaos command handlers:
 * latency normalization, preset transition events, and config
 * serialization for the UI.
 */

import type { NetworkState } from "../../network/state";
import type { LatencyProfile } from "../../types";
import type { MockEventEmitter } from "../event-emitter";

/** Normalize latency from command payload to a LatencyProfile-compatible shape */
export function normalizeLatency(
  raw?: number | string | { min: number; max: number; jitter?: number; distribution?: string },
): LatencyProfile | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number") {
    return raw === 0 ? undefined : { min: raw, max: raw };
  }
  if (typeof raw === "string") {
    return raw as LatencyProfile;
  }
  if (raw.min === 0 && raw.max === 0) return undefined;
  return { min: raw.min, max: raw.max, jitter: raw.jitter };
}

/** Compare prev/next preset names and emit appropriate experiment events */
export function emitPresetTransition(
  emitter: MockEventEmitter,
  serverId: string,
  prev: string,
  next: string,
): void {
  if (prev === next) return;
  const OFF = new Set(["none", "stable", ""]);
  const wasActive = !OFF.has(prev);
  const isActive = !OFF.has(next);

  if (wasActive) {
    emitter.emitExperimentEvent({ eventType: "stopped", serverId, mode: prev, errorRate: 0 });
  }
  if (isActive) {
    emitter.emitExperimentEvent({ eventType: "started", serverId, mode: next, errorRate: 0 });
  }
}

/** Serialize the current network state into a payload for the UI */
export function serializeConfig(state: NetworkState): Record<string, unknown> {
  const cfg = state.getGlobalConfig();
  return {
    latency: cfg?.latency ?? 0,
    errorRate: cfg?.errorRate ?? 0,
    faultWeights: cfg?.faultWeights ?? [],
    bandwidth: cfg?.bandwidth ?? 0,
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
