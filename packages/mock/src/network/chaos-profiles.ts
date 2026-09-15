import type { NetworkConfig } from "../types";

/** Pre-defined chaos engineering profiles */
export const CHAOS_PROFILES: Record<string, NetworkConfig> = {
  /** Unstable API — high latency variance, moderate errors */
  "unstable-api": {
    errorRate: 0.15,
    latency: { min: 100, max: 2000, jitter: 500 },
    faultTypes: ["500", "503", "timeout"],
  },
  /** Degraded service — slow but mostly working */
  degraded: {
    errorRate: 0.05,
    latency: "3g",
    timeout: 5000,
  },
  /** Service down — all requests fail */
  down: {
    errorRate: 1.0,
    faultTypes: ["503"],
  },
  /** Flaky connection — intermittent failures */
  flaky: {
    errorRate: 0.3,
    faultTypes: ["500", "503", "timeout", "reset"],
    latency: { min: 50, max: 500, jitter: 200 },
  },
};

/** Resolve a chaos profile by name or return custom config */
export function resolveChaosProfile(profile: string | NetworkConfig): NetworkConfig {
  if (typeof profile === "string") {
    const resolved = CHAOS_PROFILES[profile];
    if (!resolved) {
      throw new Error(
        `[courier-mock] Unknown chaos profile "${profile}". Available: ${Object.keys(CHAOS_PROFILES).join(", ")}`,
      );
    }
    return resolved;
  }
  return profile;
}
