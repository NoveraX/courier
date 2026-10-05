import type { Delay } from "@/features/mocks/latency-window";
import type { LatencyDistribution, NetworkConfig } from "@/store/mock-slice";

/** A shape the mock may draw a delay of one's own in, and what it does to the delays. */
export interface LatencyShape {
  value: LatencyDistribution;
  label: string;
  /** What the shape does, in one sentence. */
  hint: string;
}

/** The shapes a delay of one's own takes; a preset always draws log-normally. */
export const LATENCY_SHAPES: readonly LatencyShape[] = [
  { value: "uniform", label: "Uniform", hint: "Every delay in the window is as likely." },
  { value: "normal", label: "Normal", hint: "Most delays near the base, few at the edges." },
  {
    value: "log-normal",
    label: "Log-normal",
    hint: "Most delays short, now and then one near the top, as on a real network.",
  },
];

/**
 * The shape the mock draws its delays in: the one it was given, else
 * uniform, as the mock draws a range it was given no shape for.
 *
 * @param latency - The mock's latency, as Studio holds it
 * @returns The shape
 * @example
 * ```ts
 * shapeOf({ min: 300, max: 900, distribution: "log-normal" }); // → "log-normal"
 * ```
 */
export function shapeOf(latency: NetworkConfig["latency"] | undefined): LatencyDistribution {
  return typeof latency === "object" && latency.distribution ? latency.distribution : "uniform";
}

/**
 * The window a delay of one's own gives the mock: from the base less the
 * jitter to the base plus it, drawn in the shape given. The jitter is the
 * window's own, so the mock adds none.
 *
 * @param delay - The base and the jitter, in ms; the jitter no larger than the base
 * @param shape - How delays spread across the window
 * @returns The latency the mock is sent
 * @example
 * ```ts
 * customWindow({ base: 400, jitter: 120 }, "normal"); // → { min: 280, max: 520, jitter: 0, distribution: "normal" }
 * ```
 */
export function customWindow(
  { base, jitter }: Delay,
  shape: LatencyDistribution,
): { min: number; max: number; jitter: number; distribution: LatencyDistribution } {
  const spread = Math.min(jitter, base);
  return { min: base - spread, max: base + spread, jitter: 0, distribution: shape };
}
