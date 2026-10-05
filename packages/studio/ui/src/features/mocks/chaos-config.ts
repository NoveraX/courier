import type { ChaosPreset, FaultWeight, StopCondition } from "@/store/mock-slice";

/** How much of a mock's traffic fails on purpose: a preset, or a rate and mix of one's own. */
export type ChaosMode = "stable" | "degraded" | "unstable" | "down" | "custom";

/** A rate of failure, in percent, and how the failures are split by kind. */
export interface ChaosFormValues {
  errorRate: number;
  faultWeights: FaultWeight[];
}

/** Each preset's rate of failure, in percent, and its mix of faults. */
export const PRESET_CONFIG: Readonly<Record<Exclude<ChaosMode, "custom">, ChaosFormValues>> = {
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

/** The thresholds that halt an experiment on their own, switched off. */
export const DEFAULT_STOP: StopCondition = {
  enabled: false,
  errorRateThreshold: 30,
  errorRateDurationSecs: 30,
  p99Threshold: 2000,
  p99DurationSecs: 60,
  maxDurationMins: 0,
};

/** The custom rate and mix a form starts from. */
export const FORM_DEFAULTS: ChaosFormValues = {
  errorRate: 30,
  faultWeights: [
    { type: "500", weight: 50 },
    { type: "503", weight: 30 },
    { type: "timeout", weight: 20 },
  ],
};

/**
 * A preset's rate and mix, by any mode name — `undefined` for `custom`,
 * `none` or a name that is no preset.
 *
 * @param mode - The mode
 * @returns Its rate and mix, if it is a preset
 * @example
 * ```ts
 * presetConfig("degraded")?.errorRate; // 10
 * ```
 */
export function presetConfig(mode: string): ChaosFormValues | undefined {
  return Object.entries(PRESET_CONFIG).find(([name]) => name === mode)?.[1];
}

/**
 * The chaos mode a mock's chaos preset stands for: `stable` while it has none.
 *
 * @param preset - The mock's chaos preset
 * @returns The mode
 * @example
 * ```ts
 * chaosModeOf("none"); // "stable"
 * ```
 */
export function chaosModeOf(preset: ChaosPreset): ChaosMode {
  return preset === "none" ? "stable" : preset;
}
