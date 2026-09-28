/**
 * Network and chaos command handlers — apply latency, bandwidth,
 * error-rate and fault-weight configuration coming from the
 * Latency Controls and Chaos Controls panels in Studio.
 */

import { networkCommandPatch } from "../../network/command-patch";
import { recordPresets } from "../../network/record-presets";
import type { MockEventEmitter } from "../event-emitter";
import type { BridgeContext, MockChaosSetCommand, MockNetworkSetCommand } from "../types";
import { emitPresetTransition, serializeConfig } from "./network-helpers";

/** Apply latency, bandwidth and per-route overrides — whichever the command names */
export function handleNetworkSet(
  ctx: BridgeContext,
  emitter: MockEventEmitter,
  cmd: MockNetworkSetCommand,
): { updated: boolean } {
  const state = ctx.server.networkState;
  const prevLatencyPreset = state.latencyPreset;
  const patch = networkCommandPatch(cmd.config);

  state.mergeConfig(patch);
  recordPresets(state, patch, { latency: cmd.preset });
  state.resetMetrics();
  emitPresetTransition(emitter, ctx.serverId, prevLatencyPreset, state.latencyPreset);
  emitter.emitNetworkConfig(serializeConfig(state));
  return { updated: true };
}

/** Apply error rate, fault weights and stop conditions — whichever the command names */
export function handleChaosSet(
  ctx: BridgeContext,
  emitter: MockEventEmitter,
  cmd: MockChaosSetCommand,
): { updated: boolean } {
  const state = ctx.server.networkState;
  const prevChaosPreset = state.chaosPreset;
  const patch = networkCommandPatch(cmd.config);

  state.mergeConfig(patch);
  recordPresets(state, patch, { chaos: cmd.preset ?? "unstable" });
  state.resetMetrics();
  emitPresetTransition(emitter, ctx.serverId, prevChaosPreset, state.chaosPreset);
  emitter.emitNetworkConfig(serializeConfig(state));
  return { updated: true };
}
