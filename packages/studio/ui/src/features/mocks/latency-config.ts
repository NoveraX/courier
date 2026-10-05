import type { LatencyDistribution, LatencyPreset } from "@/store/mock-slice";

/** A custom delay: its range and jitter in ms, how it spreads, and a bandwidth cap in Kbps (0 for none). */
export interface LatencyFormValues {
  min: number;
  max: number;
  jitter: number;
  distribution: LatencyDistribution;
  bandwidth: number;
}

/** The delay each latency preset adds, in ms. */
export const PRESET_VALUES: Readonly<
  Record<LatencyPreset, { min: number; max: number; jitter: number }>
> = {
  none: { min: 0, max: 0, jitter: 0 },
  /* The ranges the mock itself gives these profiles. */
  "3g": { min: 300, max: 900, jitter: 150 },
  "4g": { min: 100, max: 350, jitter: 60 },
  satellite: { min: 600, max: 800, jitter: 150 },
  custom: { min: 300, max: 600, jitter: 50 },
};

/** The custom delay a form starts from. */
export const LATENCY_DEFAULTS: LatencyFormValues = {
  min: 300,
  max: 600,
  jitter: 50,
  distribution: "log-normal",
  bandwidth: 0,
};
