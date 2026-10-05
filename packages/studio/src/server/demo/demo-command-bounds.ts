/**
 * The bounds a public demo keeps a visitor's mock commands in: a seed the
 * mock serves at once, and latencies a visitor waits out.
 */

import { isPlainObject } from "../is-plain-object";

/** The most records a visitor may seed a collection with at a time. */
export const DEMO_MAX_SEED = 200;

/** The largest number a visitor may give a mock's latency or failure settings: 10 s, in milliseconds. */
export const DEMO_MAX_SETTING = 10_000;

/** The slowest a visitor may cap a mock's answers, in kilobits a second; 0 is no cap. */
export const DEMO_MIN_BANDWIDTH = 256;

/* Settings nest a level or two; anything deeper is not one the mock reads. */
const MAX_DEPTH = 6;

/**
 * Why a visitor's mock command is out of the demo's bounds: a seed of more
 * than {@link DEMO_MAX_SEED} records, a latency or failure setting above
 * {@link DEMO_MAX_SETTING}, or answers capped below
 * {@link DEMO_MIN_BANDWIDTH} Kbps. A command the mock cannot read is left
 * to the mock to refuse.
 *
 * @param command - The command as the page sent it
 * @returns Why the demo refuses it, or `null` when it is within bounds
 * @example
 * ```ts
 * demoCommandProblem({ action: "mock:store:seed", serverId: "shop", count: 5000 });
 * // → "The demo seeds up to 200 records at a time."
 * ```
 */
export function demoCommandProblem(command: unknown): string | null {
  if (!isPlainObject(command)) return null;
  const { action } = command;
  if (action === "mock:store:seed" && typeof command.count === "number") {
    return command.count > DEMO_MAX_SEED
      ? `The demo seeds up to ${DEMO_MAX_SEED} records at a time.`
      : null;
  }
  if (action !== "mock:network:set" && action !== "mock:chaos:set") return null;
  if (largest(command.config, 0) > DEMO_MAX_SETTING) {
    return (
      `The demo keeps a mock's latency and failure settings at ${DEMO_MAX_SETTING} or under — ` +
      `${DEMO_MAX_SETTING / 1000} s for a latency.`
    );
  }
  const bandwidth = isPlainObject(command.config) ? command.config.bandwidth : undefined;
  return typeof bandwidth === "number" && bandwidth > 0 && bandwidth < DEMO_MIN_BANDWIDTH
    ? `The demo caps a mock's answers at ${DEMO_MIN_BANDWIDTH} Kbps or faster.`
    : null;
}

/* The largest number anywhere in a setting; one nested too deep to read counts as too large. */
function largest(value: unknown, depth: number): number {
  if (typeof value === "number") return Number.isNaN(value) ? 0 : value;
  if (typeof value !== "object" || value === null) return 0;
  if (depth >= MAX_DEPTH) return Number.POSITIVE_INFINITY;
  const items: unknown[] = Object.values(value);
  let found = 0;
  for (const item of items) found = Math.max(found, largest(item, depth + 1));
  return found;
}
