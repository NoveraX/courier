import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

/** Values of `COURIER_WATCH_POLLING` that compare every watched file every half second. */
const ON_VALUES: ReadonlySet<string> = new Set(["1", "true", "on"]);

/** Values that leave the choice to Studio, as leaving it unset does. */
const OFF_VALUES: ReadonlySet<string> = new Set(["", "0", "false", "off"]);

/* Each value Studio does not know is said once, not at every watch set. */
const unknownSettings = new Set<string>();

/**
 * Whether `COURIER_WATCH_POLLING` asks Studio to compare every watched file
 * with the disk every half second, on any filesystem, rather than only where
 * saves arrive without a change notification.
 *
 * `1`, `true` or `on`, in any case, ask for it; unset, `0`, `false` or `off`
 * leave it to Studio. Any other value is said once and leaves it to Studio.
 *
 * @param env - The environment to read
 * @returns Whether every filesystem is compared every half second
 * @example
 * ```ts
 * pollsEverywhere({ COURIER_WATCH_POLLING: "on" }); // → true
 * ```
 */
export function pollsEverywhere(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const raw = env.COURIER_WATCH_POLLING;
  if (raw === undefined) return false;
  const value = raw.trim().toLowerCase();
  if (ON_VALUES.has(value)) return true;
  if (!OFF_VALUES.has(value) && !unknownSettings.has(raw)) {
    unknownSettings.add(raw);
    log.warn(
      `COURIER_WATCH_POLLING=${JSON.stringify(raw)} is not one of 1, true, on, 0, false or off; Studio decides where to compare files every half second`,
    );
  }
  return false;
}
