/**
 * Network/chaos/experiment shapes for the mock Zustand slice.
 *
 * Consumed by the network/scenario panels and the chaos experiment
 * history. Re-exported from `mock-slice.ts` so consumers continue to
 * import them from there.
 */

export type NetworkPreset = "none" | "3g" | "4g" | "satellite" | "flaky" | "down";
export type LatencyPreset = "none" | "3g" | "4g" | "satellite" | "custom";
export type ChaosPreset = "none" | "degraded" | "unstable" | "down" | "custom";
export type LatencyDistribution = "uniform" | "normal" | "log-normal";

export interface FaultWeight {
  type: string;
  /** 0–100, weights are normalized to sum to 100 across enabled faults */
  weight: number;
}

export interface StopCondition {
  enabled: boolean;
  /** Auto-halt when error rate exceeds this % for errorRateDurationSecs */
  errorRateThreshold: number;
  errorRateDurationSecs: number;
  /** Auto-halt when P99 exceeds this ms for p99DurationSecs */
  p99Threshold: number;
  p99DurationSecs: number;
  /** Hard cap on experiment duration in minutes; 0 = unlimited */
  maxDurationMins: number;
}

export interface NetworkConfig {
  latency:
    | number
    | { min: number; max: number; jitter?: number; distribution?: LatencyDistribution };
  /** The share of calls the mock fails, 0–1. */
  errorRate: number;
  faultWeights?: FaultWeight[];
  /** Bandwidth cap in Kbps; 0 = unlimited */
  bandwidth?: number;
  stopConditions?: StopCondition;
  routeOverrides?: RouteOverride[];
}

export interface RouteOverride {
  /** "group:endpoint" key */
  routeId: string;
  enabled: boolean;
  latency?: { min: number; max: number; jitter: number };
  /** The share of the route's calls the mock fails, 0–1, as for the mock's global rate. */
  errorRate?: number;
  faultTypes?: string[];
}

export interface SavedScenario {
  id: string;
  name: string;
  createdAt: number;
  chaosMode: string;
  networkConfig: NetworkConfig;
  networkPreset: NetworkPreset;
}

export interface ExperimentEvent {
  id: string;
  serverId: string;
  timestamp: number;
  type: "started" | "stopped" | "auto-halted";
  mode: string;
  errorRate: number;
  peakErrorRate?: number | undefined;
  peakP99?: number | undefined;
  durationMs?: number | undefined;
  reason?: string | undefined;
}
