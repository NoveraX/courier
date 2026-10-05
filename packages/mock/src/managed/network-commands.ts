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
  const prev = { preset: state.latencyPreset, startedAt: state.latencyStartedAt };
  const patch = networkCommandPatch(cmd.config);

  state.mergeConfig(patch);
  recordPresets(state, patch, { latency: presetOf(cmd.preset) });
  state.resetMetrics();
  emitPresetTransition(prev, state.latencyPreset, "none");
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
  const prev = { preset: state.chaosPreset, startedAt: state.chaosStartedAt };
  const patch = networkCommandPatch(cmd.config);

  state.mergeConfig(patch);
  recordPresets(state, patch, { chaos: presetOf(cmd.preset) ?? "unstable" });
  state.resetMetrics();
  emitPresetTransition(prev, state.chaosPreset, "none");
  emitNetworkState(server);
  return { ok: true, data: { updated: true } };
}

/**
 * Tell Studio when a stop condition halts the mock's run: the run's end,
 * with its reason and length, that it halted, and then the settings left —
 * none simulated, the stop conditions kept.
 *
 * @param server The worker's mock server
 * @example
 * ```ts
 * reportHalts(server);
 * ```
 */
export function reportHalts(server: MockServer): void {
  server.networkState.onHalt = ({ reason, durationMs }) => {
    send({
      type: "event",
      event: {
        type: "mock:experiment:event",
        eventType: "auto-halted",
        mode: "chaos",
        reason,
        errorRate: 0,
        ...(durationMs === undefined ? {} : { durationMs }),
      },
    });
    send({
      type: "event",
      event: { type: "mock:network:config", config: { autoHalted: true, haltReason: reason } },
    });
    emitNetworkState(server);
  };
}

function presetOf(preset: unknown): string | undefined {
  return typeof preset === "string" ? preset : undefined;
}

/* How long a run that started at `startedAt` lasted, for its stop event; nothing when its start is unknown. */
function lengthSince(startedAt: number | null): { durationMs?: number } {
  return startedAt === null ? {} : { durationMs: Date.now() - startedAt };
}

/** Compare prev/next preset names and emit appropriate experiment events */
function emitPresetTransition(
  prev: { preset: string; startedAt: number | null },
  next: string,
  offValue: string,
): void {
  if (prev.preset === next) return;
  const wasActive = prev.preset !== offValue && prev.preset !== "none" && prev.preset !== "stable";
  const isActive = next !== offValue && next !== "none" && next !== "stable";

  if (wasActive) {
    send({
      type: "event",
      event: {
        type: "mock:experiment:event",
        eventType: "stopped",
        mode: prev.preset,
        errorRate: 0,
        ...lengthSince(prev.startedAt),
      },
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
