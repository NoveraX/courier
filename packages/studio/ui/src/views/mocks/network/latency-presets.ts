/**
 * Static option tables and form defaults for the latency simulator, beside
 * the chaos preset tables.
 */

import { Clock, Gauge } from "lucide-react";

export const LATENCY_PRESETS = [
  { value: "none" as const, label: "Off", icon: Gauge },
  { value: "3g" as const, label: "3G · 600ms" },
  { value: "4g" as const, label: "4G · 225ms" },
  { value: "satellite" as const, label: "Satellite · 700ms" },
  { value: "custom" as const, label: "Custom", icon: Clock },
];

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
