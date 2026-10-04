/**
 * Handle network simulation and chaos engineering commands from Studio.
 */

import { networkCommandPatch } from "../network/command-patch";
import { networkConfigOnWire } from "../network/network-config-on-wire";
import { recordPresets } from "../network/record-presets";
import type { MockServer } from "../server/create-mock-server";
import { send } from "./worker-ipc";

type CmdResult = { ok: boolean; data?: unknown; error?: string };

/**
 * Apply a `mock:network:set` command: latency, bandwidth, distribution,
 * per-route overrides — whichever of them the command names.
 *
 * @param server The worker's mock server
 * @param cmd    The command Studio sent
 * @returns The command's result
 * @example
 * ```ts
 * handleNetworkCommand(server, { config: { latency: { min: 50, max: 60 } }, preset: "3g" });
 * ```
 */
export function handleNetworkCommand(server: MockServer, cmd: Record<string, unknown>): CmdResult {
  const state = server.networkState;
  const prevPreset = state.latencyPreset;
  const patch = networkCommandPatch(cmd.config);

  state.mergeConfig(patch);
  recordPresets(state, patch, { latency: presetOf(cmd.preset) });
  state.resetMetrics();
  emitPresetTransition(prevPreset, state.latencyPreset, "none");
  emitNetworkState(server);
  return { ok: true, data: { updated: true } };
}

/**
 * Apply a `mock:chaos:set` command: error rate, fault weights and stop
 * conditions — whichever of them the command names.
 *
 * @param server The worker's mock server
 * @param cmd    The command Studio sent
 * @returns The command's result
 * @example
 * ```ts
 * handleChaosCommand(server, { config: { errorRate: 1 }, preset: "down" });
 * ```
 */
export function handleChaosCommand(server: MockServer, cmd: Record<string, unknown>): CmdResult {
  const state = server.networkState;
  const prevPreset = state.chaosPreset;
  const patch = networkCommandPatch(cmd.config);

  state.mergeConfig(patch);
  recordPresets(state, patch, { chaos: presetOf(cmd.preset) ?? "unstable" });
  state.resetMetrics();
  emitPresetTransition(prevPreset, state.chaosPreset, "none");
  emitNetworkState(server);
  return { ok: true, data: { updated: true } };
}

export function checkAutoHalt(server: MockServer): void {
  const reason = server.networkState.checkStopConditions();
  if (!reason) return;

  server.networkState.setConfig(undefined);
  server.networkState.resetMetrics();
  send({
    type: "event",
    event: {
      type: "mock:experiment:event",
      eventType: "auto-halted",
      mode: "chaos",
      reason,
      errorRate: 0,
    },
  });
  emitNetworkState(server);
  send({
    type: "event",
    event: { type: "mock:network:config", config: { autoHalted: true, haltReason: reason } },
  });
}

function presetOf(preset: unknown): string | undefined {
  return typeof preset === "string" ? preset : undefined;
}

/** Compare prev/next preset names and emit appropriate experiment events */
function emitPresetTransition(prev: string, next: string, offValue: string): void {
  if (prev === next) return;
  const wasActive = prev !== offValue && prev !== "none" && prev !== "stable";
  const isActive = next !== offValue && next !== "none" && next !== "stable";

  if (wasActive) {
    send({
      type: "event",
      event: { type: "mock:experiment:event", eventType: "stopped", mode: prev, errorRate: 0 },
    });
  }
  if (isActive) {
    send({
      type: "event",
      event: { type: "mock:experiment:event", eventType: "started", mode: next, errorRate: 0 },
    });
  }
}

function emitNetworkState(server: MockServer): void {
  send({
    type: "event",
    event: { type: "mock:network:config", config: networkConfigOnWire(server.networkState) },
  });
}
