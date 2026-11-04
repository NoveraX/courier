/**
 * What a deployment setting is as a handler's config gives it — a list, or a
 * function called once — what reading it comes to, the environment variable
 * each is read from when the config names none, and the limits a reading is
 * held to. A source is read by `setting-readings`, a reading is remembered
 * by `setting-reader`, and what the settings are, and who enforces them, is
 * `runtime-policy`'s.
 *
 * The limits live here rather than with the adapter's `LIMITS`, which a
 * page's realtime client bundles: nothing of this module reaches a browser.
 */

import type { ConfigurationError, ConfigurationErrorCode } from "../errors";

/**
 * A deployment setting: given as it is, or as a function the handler calls
 * when the first request that needs the setting comes in. The function's
 * `undefined` leaves the setting to the environment.
 */
export type RuntimeSetting<TValue> = TValue | (() => TValue | undefined);

/** What reading a setting came to: its value, none when nothing sets it, or why it cannot be used. */
export type SettingReading<TValue> =
  | { readonly ok: true; readonly value: TValue | undefined }
  | { readonly ok: false; readonly error: ConfigurationError };

/** The environment variable each setting is read from when the config names none. */
export const RUNTIME_SETTING_VARIABLES = {
  allowedHosts: "COURIER_ALLOWED_HOSTS",
  allowedOrigins: "COURIER_ALLOWED_ORIGINS",
} as const;

/** How much of a setting is read at most, and how many of a variable's values are remembered. */
export const RUNTIME_SETTING_LIMITS = {
  /** Longest value of a setting's environment variable, in characters (64 KiB). */
  MAX_VARIABLE_LENGTH: 65_536,
  /** Most entries one setting may hold. */
  MAX_ENTRIES: 1_000,
  /** Longest `allowedOrigins` entry, in characters. */
  MAX_ORIGIN_LENGTH: 2_048,
  /** Longest part of an entry a message quotes, in characters. */
  MAX_QUOTED_LENGTH: 300,
  /** Distinct values of a variable whose readings are remembered. */
  KEPT_VARIABLE_VALUES: 4,
} as const;

/** The settings read this way. */
export type SettingName = keyof typeof RUNTIME_SETTING_VARIABLES;

/** A setting's entries checked and made its value, or the first entry that cannot be one. */
export type Compiled<TValue> =
  | { readonly value: TValue }
  | { readonly code: ConfigurationErrorCode; readonly entry: string; readonly problem: string };

/** What a setting is, and how its entries become its value. */
export interface SettingKind<TValue> {
  readonly name: SettingName;
  /** What the entries are, for a message: "hosts". */
  readonly entries: string;
  readonly compile: (entries: readonly string[]) => Compiled<TValue>;
}

/** The reading of a setting nothing sets. */
export const NOT_SET: SettingReading<never> = { ok: true, value: undefined };
