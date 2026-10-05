import { networkCommandPatch } from "../network/command-patch";
import type { MockServer } from "../server/create-mock-server";
import { emitNetworkState } from "./network-commands";
import type { CmdResult } from "./store-commands";

const presetOf = (preset: unknown): string =>
  typeof preset === "string" && preset !== "" ? preset : "none";

/**
 * Answer `mock:network:restore`: make the mock's network conditions the
 * ones Studio kept for it, whole — its settings, or none, and the presets
 * named — as Studio does when a mock it set conditions on starts again.
 * Each restored condition counts as started now.
 *
 * @param server - The mock
 * @param cmd - The command: the settings as the mock last reported them, and its presets
 * @returns That it was done
 * @example
 * ```ts
 * restoreNetwork(server, { action: "mock:network:restore", config, latencyPreset: "3g", chaosPreset: "none" });
 * ```
 */
export function restoreNetwork(server: MockServer, cmd: Record<string, unknown>): CmdResult {
  const state = server.networkState;
  const config = typeof cmd.config === "object" && cmd.config !== null ? cmd.config : undefined;
  state.setConfig(config === undefined ? undefined : networkCommandPatch(config));
  const now = Date.now();
  state.latencyPreset = presetOf(cmd.latencyPreset);
  state.latencyStartedAt = state.latencyPreset === "none" ? null : now;
  state.chaosPreset = presetOf(cmd.chaosPreset);
  state.chaosStartedAt = state.chaosPreset === "none" ? null : now;
  state.resetMetrics();
  emitNetworkState(server);
  return { ok: true };
}
