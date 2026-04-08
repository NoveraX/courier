/**
 * Network and chaos command handlers — apply latency, bandwidth,
 * error-rate and fault-weight configuration coming from the
 * Latency Controls and Chaos Controls panels in Studio.
 */

import type { FaultWeight, NetworkConfig, RouteNetworkOverride, StopCondition } from "../../types";
import type { MockEventEmitter } from "../event-emitter";
import type { BridgeContext, MockChaosSetCommand, MockNetworkSetCommand } from "../types";
import { emitPresetTransition, normalizeLatency, serializeConfig } from "./network-helpers";

/** Apply latency + bandwidth config from the Latency Controls panel */
export function handleNetworkSet(
  ctx: BridgeContext,
  emitter: MockEventEmitter,
  cmd: MockNetworkSetCommand,
): { updated: boolean } {
  const state = ctx.server.networkState;
  const prevLatencyPreset = state.latencyPreset;
  const raw = cmd.config;

  const patch: Partial<NetworkConfig> = {
    latency: normalizeLatency(raw.latency),
    bandwidth: raw.bandwidth,
    distribution:
      raw.latency && typeof raw.latency === "object" && "distribution" in raw.latency
        ? (raw.latency.distribution as NetworkConfig["distribution"])
        : undefined,
    routeOverrides: raw.routeOverrides as RouteNetworkOverride[] | undefined,
    stopConditions: raw.stopConditions as StopCondition | undefined,
  };

  const rawAny = raw as Record<string, unknown>;
  if (rawAny.errorRate !== undefined) patch.errorRate = rawAny.errorRate as number;
  if (rawAny.faultWeights !== undefined) patch.faultWeights = rawAny.faultWeights as FaultWeight[];

  state.mergeConfig(patch);

  if (cmd.preset !== undefined) {
    const hasLatency = patch.latency !== undefined;
    const hasChaos = patch.errorRate !== undefined;
    if (hasLatency) {
      state.latencyPreset = cmd.preset;
      state.latencyStartedAt = cmd.preset === "none" ? null : Date.now();
    }
    if (hasChaos) {
      state.chaosPreset = (patch.errorRate ?? 0) > 0 ? cmd.preset : "none";
      state.chaosStartedAt = (patch.errorRate ?? 0) > 0 ? Date.now() : null;
    }
  }

  state.resetMetrics();
  emitPresetTransition(emitter, ctx.serverId, prevLatencyPreset, state.latencyPreset);
  emitter.emitNetworkConfig(serializeConfig(state));
  return { updated: true };
}

/** Apply chaos/error config from the Chaos Controls panel */
export function handleChaosSet(
  ctx: BridgeContext,
  emitter: MockEventEmitter,
  cmd: MockChaosSetCommand,
): { updated: boolean } {
  const state = ctx.server.networkState;
  const prevChaosPreset = state.chaosPreset;
  const raw = cmd.config;

  state.mergeConfig({
    errorRate: raw.errorRate,
    faultWeights: raw.faultWeights as FaultWeight[] | undefined,
    stopConditions: raw.stopConditions as StopCondition | undefined,
  });

  if (cmd.preset !== undefined) {
    state.chaosPreset = (raw.errorRate ?? 0) > 0 ? cmd.preset : "none";
    state.chaosStartedAt = (raw.errorRate ?? 0) > 0 ? Date.now() : null;
  }

  state.resetMetrics();
  emitPresetTransition(emitter, ctx.serverId, prevChaosPreset, state.chaosPreset);
  emitter.emitNetworkConfig(serializeConfig(state));
  return { updated: true };
}
