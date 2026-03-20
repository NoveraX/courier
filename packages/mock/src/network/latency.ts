import type { LatencyProfile } from "../types";

const LATENCY_PROFILES: Record<string, { min: number; max: number; jitter: number }> = {
  "3g": { min: 200, max: 600, jitter: 100 },
  "4g": { min: 50, max: 150, jitter: 30 },
  wifi: { min: 10, max: 50, jitter: 10 },
  fiber: { min: 1, max: 5, jitter: 1 },
};

/** Resolve a latency profile to a concrete delay in ms */
export function resolveLatency(profile: LatencyProfile): number {
  const config = typeof profile === "string" ? LATENCY_PROFILES[profile] : profile;
  if (!config) return 0;

  const { min, max, jitter = 0 } = config;
  const base = min + Math.random() * (max - min);
  const jitterOffset = (Math.random() - 0.5) * 2 * jitter;

  return Math.max(0, Math.round(base + jitterOffset));
}

/** Get LATENCY_PROFILES for display/admin */
export { LATENCY_PROFILES };
