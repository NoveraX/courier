/**
 * Static option tables and form defaults for the latency simulator, beside
 * the chaos preset tables.
 */

import { Clock, Gauge } from "lucide-react";

import type { LatencyDistribution, LatencyPreset } from "@/store/mock-slice";

export interface LatencyFormValues {
  min: number;
  max: number;
  jitter: number;
  distribution: LatencyDistribution;
  bandwidth: number;
}

export const LATENCY_PRESETS = [
  { value: "none" as const, label: "Off", icon: Gauge },
  { value: "3g" as const, label: "3G · 600ms" },
  { value: "4g" as const, label: "4G · 225ms" },
  { value: "satellite" as const, label: "Satellite · 700ms" },
  { value: "custom" as const, label: "Custom", icon: Clock },
];

export const PRESET_VALUES: Record<LatencyPreset, { min: number; max: number; jitter: number }> = {
  none: { min: 0, max: 0, jitter: 0 },
  /* The ranges the mock itself gives these profiles. */
  "3g": { min: 300, max: 900, jitter: 150 },
  "4g": { min: 100, max: 350, jitter: 60 },
  satellite: { min: 600, max: 800, jitter: 150 },
  custom: { min: 300, max: 600, jitter: 50 },
};

export const DISTRIBUTION_OPTIONS = [
  { value: "uniform" as const, label: "Uniform" },
  { value: "normal" as const, label: "Normal" },
  { value: "log-normal" as const, label: "Log-Normal" },
];

export const BANDWIDTH_OPTIONS = [
  { value: "0" as const, label: "∞ Unlimited" },
  { value: "512" as const, label: "512 Kbps" },
  { value: "1500" as const, label: "1.5 Mbps" },
  { value: "10000" as const, label: "10 Mbps" },
];

export const LATENCY_DEFAULTS: LatencyFormValues = {
  min: 300,
  max: 600,
  jitter: 50,
  distribution: "log-normal",
  bandwidth: 0,
};
