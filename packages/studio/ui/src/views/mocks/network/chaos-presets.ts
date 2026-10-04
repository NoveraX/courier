/**
 * Static preset / form-default tables for the chaos engineering controls,
 * beside the other mock-network configuration data.
 */

import { Flame, SlidersHorizontal } from "lucide-react";

import type { FaultWeight, StopCondition } from "@/store/mock-slice";

export type ChaosMode = "stable" | "degraded" | "unstable" | "down" | "custom";

export interface ChaosFormValues {
  errorRate: number;
  faultWeights: FaultWeight[];
}

export const CHAOS_PRESETS = [
  { value: "stable" as const, label: "Stable" },
  { value: "degraded" as const, label: "Degraded" },
  { value: "unstable" as const, label: "Unstable" },
  { value: "down" as const, label: "Down", icon: Flame },
  { value: "custom" as const, label: "Custom", icon: SlidersHorizontal },
];

export const PRESET_CONFIG: Record<string, { errorRate: number; faultWeights: FaultWeight[] }> = {
  stable: { errorRate: 0, faultWeights: [] },
  degraded: {
    errorRate: 10,
    faultWeights: [
      { type: "500", weight: 60 },
      { type: "timeout", weight: 40 },
    ],
  },
  unstable: {
    errorRate: 40,
    faultWeights: [
      { type: "500", weight: 40 },
      { type: "503", weight: 30 },
      { type: "timeout", weight: 20 },
      { type: "reset", weight: 10 },
    ],
  },
  down: {
    errorRate: 100,
    faultWeights: [{ type: "503", weight: 100 }],
  },
};

export const DEFAULT_STOP: StopCondition = {
  enabled: false,
  errorRateThreshold: 30,
  errorRateDurationSecs: 30,
  p99Threshold: 2000,
  p99DurationSecs: 60,
  maxDurationMins: 0,
};

export const FORM_DEFAULTS: ChaosFormValues = {
  errorRate: 30,
  faultWeights: [
    { type: "500", weight: 50 },
    { type: "503", weight: 30 },
    { type: "timeout", weight: 20 },
  ],
};
