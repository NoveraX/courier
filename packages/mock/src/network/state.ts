import type { NetworkConfig, RouteNetworkOverride } from "../types";

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
  /** Track a request result for stop condition monitoring */
  trackRequest(duration: number, isError: boolean): void;
  /** Check if stop conditions have been met — returns reason or undefined */
  checkStopConditions(): string | undefined;
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
  let startedAt: number | null = initial ? Date.now() : null;
  let latencyPreset = "none";
  let latencyStartedAt: number | null = null;
  let chaosPreset = "none";
  let chaosStartedAt: number | null = null;

  // Stop condition metrics
  const recentRequests: Array<{ time: number; duration: number; error: boolean }> = [];
  const MAX_TRACKING = 1000;

  return {
    get startedAt() {
      return startedAt;
    },
    set startedAt(v) {
      startedAt = v;
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

    getConfig(group, endpoint) {
      if (!config) return undefined;
      if (group && endpoint && config.routeOverrides?.length) {
        const override = findRouteOverride(config.routeOverrides, group, endpoint);
        if (override) return mergeOverride(config, override);
      }
      return config;
    },

    getGlobalConfig() {
      return config;
    },

    mergeConfig(patch) {
      config = { ...config, ...patch } as NetworkConfig;
      if (isActive(config)) {
        startedAt ??= Date.now();
      } else {
        startedAt = null;
      }
      return config;
    },

    setConfig(newConfig) {
      config = newConfig;
      startedAt = newConfig && isActive(newConfig) ? Date.now() : null;
      if (!newConfig) {
        latencyPreset = "none";
        latencyStartedAt = null;
        chaosPreset = "none";
        chaosStartedAt = null;
      }
    },

    trackRequest(duration, isError) {
      recentRequests.push({ time: Date.now(), duration, error: isError });
      if (recentRequests.length > MAX_TRACKING) recentRequests.splice(0, 100);
    },

    checkStopConditions() {
      if (!config?.stopConditions?.enabled || !startedAt) return undefined;
      const sc = config.stopConditions;
      const now = Date.now();

      // Max duration check
      if (sc.maxDurationMins > 0) {
        const elapsed = (now - startedAt) / 60_000;
        if (elapsed >= sc.maxDurationMins) return `max duration (${sc.maxDurationMins}min)`;
      }

      // Error rate check
      if (sc.errorRateThreshold > 0) {
        const window = now - sc.errorRateDurationSecs * 1000;
        const recent = recentRequests.filter((r) => r.time >= window);
        if (recent.length >= 5) {
          const rate = (recent.filter((r) => r.error).length / recent.length) * 100;
          if (rate >= sc.errorRateThreshold)
            return `error rate ${rate.toFixed(0)}% > ${sc.errorRateThreshold}%`;
        }
      }

      // P99 check
      if (sc.p99Threshold > 0) {
        const window = now - sc.p99DurationSecs * 1000;
        const recent = recentRequests.filter((r) => r.time >= window);
        if (recent.length >= 10) {
          const sorted = recent.map((r) => r.duration).sort((a, b) => a - b);
          const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
          if (p99 >= sc.p99Threshold) return `P99 ${p99.toFixed(0)}ms > ${sc.p99Threshold}ms`;
        }
      }

      return undefined;
    },

    resetMetrics() {
      recentRequests.length = 0;
    },
  };
}

function isActive(config: NetworkConfig): boolean {
  return (config.errorRate ?? 0) > 0 || hasLatency(config);
}

function hasLatency(config: NetworkConfig): boolean {
  if (!config.latency) return false;
  if (typeof config.latency === "number") return config.latency > 0;
  if (typeof config.latency === "string") return true;
  return config.latency.max > 0;
}

function findRouteOverride(
  overrides: RouteNetworkOverride[],
  group: string,
  endpoint: string,
): RouteNetworkOverride | undefined {
  return overrides.find((o) => o.enabled && o.routeId === `${group}:${endpoint}`);
}

/** Merge a route override into the global config — override fields take precedence */
function mergeOverride(global: NetworkConfig, override: RouteNetworkOverride): NetworkConfig {
  return {
    ...global,
    latency: override.latency ?? global.latency,
    errorRate: override.errorRate !== undefined ? override.errorRate / 100 : global.errorRate,
    faultTypes: override.faultTypes?.length
      ? (override.faultTypes as NetworkConfig["faultTypes"])
      : global.faultTypes,
    // Clear route overrides so we don't recurse
    routeOverrides: undefined,
  };
}
