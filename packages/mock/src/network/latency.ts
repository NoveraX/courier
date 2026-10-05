import type { LatencyDistribution, LatencyProfile, NetworkConfig, ResolvedHandler } from "../types";

const LATENCY_PROFILES: Record<string, { min: number; max: number; jitter: number }> = {
  "3g": { min: 300, max: 900, jitter: 150 },
  "4g": { min: 100, max: 350, jitter: 60 },
  wifi: { min: 15, max: 60, jitter: 15 },
  fiber: { min: 1, max: 8, jitter: 2 },
};

/** Resolve a latency profile to a concrete delay in ms */
export function resolveLatency(
  profile: LatencyProfile,
  distribution: LatencyDistribution = "uniform",
): number {
  const config = typeof profile === "string" ? LATENCY_PROFILES[profile] : profile;
  if (!config) return 0;

  const { min, max, jitter = 0 } = config;
  const base = sampleBase(min, max, distribution);
  const jitterOffset = (Math.random() - 0.5) * 2 * jitter;

  return Math.max(0, Math.round(base + jitterOffset));
}

/**
 * How long an answer waits before it is sent: the handler's own delay, else
 * its own latency, else the network's — a latency drawn in the network's
 * distribution, uniform unless it names one.
 *
 * @param handler - The handler's own delay and latency, if it has them
 * @param network - The network conditions the answer is made under
 * @returns The delay in ms, or `undefined` when nothing delays the answer
 * @example
 * ```ts
 * resolveDelay({}, { latency: { min: 100, max: 300 }, distribution: "normal" }); // → about 200
 * ```
 */
export function resolveDelay(
  handler: Pick<ResolvedHandler, "delayMs" | "latency">,
  network?: NetworkConfig,
): number | undefined {
  const distribution = network?.distribution ?? "uniform";
  if (handler.delayMs !== undefined) return handler.delayMs;
  if (handler.latency) return resolveLatency(handler.latency, distribution);
  if (!network?.latency) return undefined;
  const { latency } = network;
  return resolveLatency(
    typeof latency === "number" ? { min: latency, max: latency } : latency,
    distribution,
  );
}

/** Sample a base value from [min, max] using the given distribution */
function sampleBase(min: number, max: number, distribution: LatencyDistribution): number {
  if (min >= max) return min;
  const range = max - min;

  switch (distribution) {
    case "normal":
      return min + clamp01(boxMullerNormal()) * range;
    case "log-normal":
      return min + clamp01(logNormalSample()) * range;
    default:
      return min + Math.random() * range;
  }
}

/** Box-Muller transform → standard normal, then map to [0, 1] range */
function boxMullerNormal(): number {
  const u1 = Math.random() || 0.0001;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  // Map z ∈ (-∞, +∞) to roughly [0, 1] — center at 0.5, σ ≈ 0.15
  return 0.5 + z * 0.15;
}

/** Log-normal sample mapped to [0, 1] — produces right-skewed distribution */
function logNormalSample(): number {
  const u1 = Math.random() || 0.0001;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  // μ = -0.5, σ = 0.5 → median ≈ 0.6, right-skewed
  const raw = Math.exp(-0.5 + z * 0.5);
  // Normalize: raw ∈ (0, ~5) → map [0, 3] to [0, 1]
  return raw / 3;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export { LATENCY_PROFILES };
