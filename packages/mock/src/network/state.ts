import type { NetworkConfig } from "../types";
import { isActive, routeConfigOf } from "./config-shape";
import { switchedOff } from "./route-override-list";
import type { NetworkHalt, TrackedAnswer } from "./stop-conditions";
import { crossedStopCondition } from "./stop-conditions";

/** Mutable network simulation state — shared across request handlers */
export interface NetworkState {
  /** Get the effective config for a specific route (checks overrides first) */
  getConfig(group?: string, endpoint?: string): NetworkConfig | undefined;
  /** Get the raw global config */
  getGlobalConfig(): NetworkConfig | undefined;
  /** Merge partial config into current global config */
  mergeConfig(patch: Partial<NetworkConfig>): NetworkConfig;
  /** Replace the entire config */
  setConfig(config: NetworkConfig | undefined): void;
  /**
   * Track an answer for the stop conditions. An answer that brings the run
   * across one halts it: every setting it simulates is cleared, presets
   * included, the route overrides are switched off keeping their settings,
   * the stop conditions stay for the next run, and `onHalt` is told why.
   */
  trackRequest(duration: number, isError: boolean): void;
  /** Check if stop conditions have been met — returns reason or undefined */
  checkStopConditions(): string | undefined;
  /** Called when a stop condition halts the run, after its settings are cleared */
  onHalt: ((halt: NetworkHalt) => void) | undefined;
  /** Reset tracking metrics (called on config change) */
  resetMetrics(): void;
  /** Timestamp when fault injection started */
  startedAt: number | null;
  /** Active latency preset label — stored for UI restore on reconnect */
  latencyPreset: string;
  /** Timestamp when latency was activated */
  latencyStartedAt: number | null;
  /** Active chaos preset label — stored for UI restore on reconnect */
  chaosPreset: string;
  /** Timestamp when chaos was activated */
  chaosStartedAt: number | null;
}

export function createNetworkState(initial?: NetworkConfig): NetworkState {
  let config: NetworkConfig | undefined = initial;
  let startedAt: number | null = initial && isActive(initial) ? Date.now() : null;
  let latencyPreset = "none";
  let latencyStartedAt: number | null = null;
  let chaosPreset = "none";
  let chaosStartedAt: number | null = null;

  let onHalt: ((halt: NetworkHalt) => void) | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const recentRequests: TrackedAnswer[] = [];
  const MAX_TRACKING = 1000;

  const clear = (): void => {
    clearTimeout(deadline);
    config = undefined;
    startedAt = null;
    latencyPreset = "none";
    latencyStartedAt = null;
    chaosPreset = "none";
    chaosStartedAt = null;
  };
  const crossed = (): string | undefined => {
    if (!config?.stopConditions?.enabled || !startedAt) return undefined;
    return crossedStopCondition(config.stopConditions, startedAt, recentRequests, Date.now());
  };
  /* A halt clears what the mock simulates and keeps what halts it, so the next run halts too;
     the route overrides stay, switched off, so they can be switched back on as they were. */
  const halt = (reason: string): void => {
    const ran = startedAt === null ? undefined : Date.now() - startedAt;
    const kept = keptThroughHalt(config);
    clear();
    config = kept;
    recentRequests.length = 0;
    onHalt?.({ reason, durationMs: ran });
  };
  /* A run's longest length ends it on time, though no answer comes to notice. */
  const scheduleDeadline = (): void => {
    clearTimeout(deadline);
    const mins = config?.stopConditions?.enabled ? config.stopConditions.maxDurationMins : 0;
    if (!mins || startedAt === null) return;
    const left = Math.max(0, startedAt + mins * 60_000 - Date.now());
    deadline = setTimeout(() => halt(`max duration (${mins}min)`), left);
    deadline.unref?.();
  };
  scheduleDeadline();

  return {
    get startedAt() {
      return startedAt;
    },
    set startedAt(v) {
      startedAt = v;
      scheduleDeadline();
    },
    get latencyPreset() {
      return latencyPreset;
    },
    set latencyPreset(v) {
      latencyPreset = v;
    },
    get latencyStartedAt() {
      return latencyStartedAt;
    },
    set latencyStartedAt(v) {
      latencyStartedAt = v;
    },
    get chaosPreset() {
      return chaosPreset;
    },
    set chaosPreset(v) {
      chaosPreset = v;
    },
    get chaosStartedAt() {
      return chaosStartedAt;
    },
    set chaosStartedAt(v) {
      chaosStartedAt = v;
    },
    get onHalt() {
      return onHalt;
    },
    set onHalt(v) {
      onHalt = v;
    },

    getConfig(group, endpoint) {
      if (!config || !group || !endpoint) return config;
      return routeConfigOf(config, group, endpoint);
    },

    getGlobalConfig() {
      return config;
    },

    mergeConfig(patch) {
      const merged = { ...config, ...patch };
      config = merged;
      startedAt = isActive(merged) ? (startedAt ?? Date.now()) : null;
      scheduleDeadline();
      return merged;
    },

    setConfig(newConfig) {
      if (newConfig) {
        config = newConfig;
        startedAt = isActive(newConfig) ? Date.now() : null;
      } else clear();
      scheduleDeadline();
    },

    trackRequest(duration, isError) {
      recentRequests.push({ time: Date.now(), duration, error: isError });
      if (recentRequests.length > MAX_TRACKING) recentRequests.splice(0, 100);
      const reason = crossed();
      if (reason) halt(reason);
    },

    checkStopConditions: crossed,

    resetMetrics() {
      recentRequests.length = 0;
    },
  };
}

/* What a halt leaves of a config: its stop conditions, and its route overrides switched off. */
function keptThroughHalt(config: NetworkConfig | undefined): NetworkConfig | undefined {
  const { stopConditions, routeOverrides } = config ?? {};
  const kept: NetworkConfig = {
    ...(stopConditions && { stopConditions }),
    ...(routeOverrides?.length && { routeOverrides: switchedOff(routeOverrides) }),
  };
  return Object.keys(kept).length > 0 ? kept : undefined;
}
