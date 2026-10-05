import type { StopCondition } from "../types";

/** An answer as the stop conditions weigh it: when it ended, how long it took, and whether it failed */
export interface TrackedAnswer {
  time: number;
  duration: number;
  error: boolean;
}

/** A run halted by a stop condition */
export interface NetworkHalt {
  /** The condition it crossed, as `error rate 45% > 30%`, `P99 2400ms > 2000ms` or `max duration (10min)` */
  reason: string;
  /** How long the run lasted, in ms */
  durationMs?: number | undefined;
}

/* The fewest answers a window must hold before its error rate or p99 can halt a run. */
const MIN_FOR_ERROR_RATE = 5;
const MIN_FOR_P99 = 10;

/**
 * The stop condition a run has crossed, if any: it ran its longest, the
 * share of answers that failed within the error-rate window reached the
 * threshold, or the p99 within its window did. A window decides nothing
 * until it holds 5 answers for the error rate and 10 for the p99; a
 * threshold of 0 is off.
 *
 * @param conditions - The run's stop conditions
 * @param startedAt - When the run started, in ms since the epoch
 * @param answers - The answers tracked since the run, or its settings, last changed
 * @param now - The time now, in ms since the epoch
 * @returns The condition crossed, as a reason, or `undefined`
 * @example
 * ```ts
 * crossedStopCondition({ ...conditions, maxDurationMins: 1 }, start, [], start + 60_000);
 * // → "max duration (1min)"
 * ```
 */
export function crossedStopCondition(
  conditions: StopCondition,
  startedAt: number,
  answers: readonly TrackedAnswer[],
  now: number,
): string | undefined {
  const { maxDurationMins } = conditions;
  if (maxDurationMins > 0 && (now - startedAt) / 60_000 >= maxDurationMins)
    return `max duration (${maxDurationMins}min)`;
  return errorRateCrossed(conditions, answers, now) ?? p99Crossed(conditions, answers, now);
}

function errorRateCrossed(
  { errorRateThreshold: threshold, errorRateDurationSecs: secs }: StopCondition,
  answers: readonly TrackedAnswer[],
  now: number,
): string | undefined {
  if (threshold <= 0) return undefined;
  const window = within(answers, now, secs);
  if (window.length < MIN_FOR_ERROR_RATE) return undefined;
  const rate = (window.filter((answer) => answer.error).length / window.length) * 100;
  return rate >= threshold ? `error rate ${rate.toFixed(0)}% > ${threshold}%` : undefined;
}

function p99Crossed(
  { p99Threshold: threshold, p99DurationSecs: secs }: StopCondition,
  answers: readonly TrackedAnswer[],
  now: number,
): string | undefined {
  if (threshold <= 0) return undefined;
  const window = within(answers, now, secs);
  if (window.length < MIN_FOR_P99) return undefined;
  const sorted = window.map((answer) => answer.duration).sort((a, b) => a - b);
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  return p99 >= threshold ? `P99 ${p99.toFixed(0)}ms > ${threshold}ms` : undefined;
}

function within(answers: readonly TrackedAnswer[], now: number, secs: number): TrackedAnswer[] {
  const from = now - secs * 1000;
  return answers.filter((answer) => answer.time >= from);
}
