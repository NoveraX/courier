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

/** The most records a collection may hold for a visitor to add another. */
export const DEMO_MAX_RECORDS = 1000;

/** How many records a mock's collection holds, when Studio knows. */
export type RecordsIn = (serverId: string, collection: string) => number | undefined;

/* Settings nest a level or two; anything deeper is not one the mock reads. */
const MAX_DEPTH = 6;

/**
 * Why a visitor's mock command is out of the demo's bounds: a seed of more
 * than {@link DEMO_MAX_SEED} records, a record added to a collection that
 * holds {@link DEMO_MAX_RECORDS} already, a latency or failure setting above
 * {@link DEMO_MAX_SETTING}, or answers or uploads capped below
 * {@link DEMO_MIN_BANDWIDTH} Kbps. An upload's size limit is a count of
 * bytes, not a setting a visitor waits out, and is not held to the bound.
 * A command the mock cannot read is left to the mock to refuse.
 *
 * @param command - The command as the page sent it
 * @param recordsIn - How many records a collection holds, when Studio knows
 * @returns Why the demo refuses it, or `null` when it is within bounds
 * @example
 * ```ts
 * demoCommandProblem({ action: "mock:store:seed", serverId: "shop", count: 5000 });
 * // → "The demo seeds up to 200 records at a time."
 * ```
 */
export function demoCommandProblem(command: unknown, recordsIn?: RecordsIn): string | null {
  if (!isPlainObject(command)) return null;
  const { action, serverId, collection } = command;
  if (
    action === "mock:store:create" &&
    typeof serverId === "string" &&
    typeof collection === "string"
  ) {
    return (recordsIn?.(serverId, collection) ?? 0) >= DEMO_MAX_RECORDS
      ? `The demo keeps up to ${DEMO_MAX_RECORDS} records in a collection. Delete some to add another.`
      : null;
  }
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
  const config = isPlainObject(command.config) ? command.config : {};
  const uploads = isPlainObject(config.uploads) ? config.uploads : {};
  if (tooSlow(config.bandwidth) || tooSlow(uploads.bandwidth)) {
    return `The demo caps a mock's answers and uploads at ${DEMO_MIN_BANDWIDTH} Kbps or faster.`;
  }
  return null;
}

function tooSlow(kbps: unknown): boolean {
  return typeof kbps === "number" && kbps > 0 && kbps < DEMO_MIN_BANDWIDTH;
}

/* An upload's size limit, in bytes, wherever it is set. */
const BYTE_COUNTS: ReadonlySet<string> = new Set(["maxBytes"]);

/* The largest number anywhere in a setting, byte counts aside; one nested too deep to read counts as too large. */
function largest(value: unknown, depth: number): number {
  if (typeof value === "number") return Number.isNaN(value) ? 0 : value;
  if (typeof value !== "object" || value === null) return 0;
  if (depth >= MAX_DEPTH) return Number.POSITIVE_INFINITY;
  const entries: Array<[string, unknown]> = Object.entries(value);
  let found = 0;
  for (const [key, item] of entries) {
    if (!BYTE_COUNTS.has(key)) found = Math.max(found, largest(item, depth + 1));
  }
  return found;
}
