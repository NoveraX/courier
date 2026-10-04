import type { NetworkConfig } from "../types";
import type { NetworkState } from "./state";

/** Preset names to record for the parts of the config a command turned on */
export interface PresetNames {
  latency?: string | undefined;
  chaos?: string | undefined;
}

/**
 * Record which latency and chaos presets a command put in effect, for the
 * parts of the config it changed. A part the command left alone keeps its
 * preset and start time, so Studio goes on showing what is still active.
 *
 * @param state The mock's network state, updated in place
 * @param patch What the command changed (see `networkCommandPatch`)
 * @param names The presets to record for a part the command turned on;
 *   `custom` when none is named
 * @returns Nothing; `state` is updated
 * @example
 * ```ts
 * recordPresets(state, { latency: { min: 50, max: 60 } }, { latency: "3g" });
 * // state.latencyPreset === "3g"; the chaos preset is untouched
 * ```
 */
export function recordPresets(
  state: NetworkState,
  patch: Partial<NetworkConfig>,
  names: PresetNames,
): void {
  const now = Date.now();
  if (Object.hasOwn(patch, "latency")) {
    const on = patch.latency !== undefined;
    state.latencyPreset = on ? (names.latency ?? "custom") : "none";
    state.latencyStartedAt = on ? now : null;
  }
  if (Object.hasOwn(patch, "errorRate")) {
    const on = (patch.errorRate ?? 0) > 0;
    state.chaosPreset = on ? (names.chaos ?? "custom") : "none";
    state.chaosStartedAt = on ? now : null;
  }
}
