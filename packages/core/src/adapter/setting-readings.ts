/**
 * What one source of a deployment setting gives, read once: the list the
 * config writes, what its function returns, or the entries of its
 * environment variable — each checked by the setting's own rule and kept
 * within `RUNTIME_SETTING_LIMITS`, or the reason it cannot be used, worded
 * to name the setting and where it came from. Which reading is remembered is
 * the reader's (`settingReader`).
 */

import { ConfigurationError, type ConfigurationErrorCode } from "../errors";
import { wordsUpTo } from "../utils/words-up-to";
import {
  RUNTIME_SETTING_LIMITS,
  RUNTIME_SETTING_VARIABLES,
  type SettingKind,
  type SettingReading,
} from "./runtime-setting";

/** A function that returned `undefined`: the setting is the environment's. */
export const FROM_VARIABLE: unique symbol = Symbol("from the variable");

/* Where a setting was read from, as a message names it. */
type Source = "config" | "function" | "variable";

/**
 * What a setting's function gives, called once.
 *
 * @param kind - The setting
 * @param setting - Its function, as the config gives it
 * @returns The reading, or `FROM_VARIABLE` when the function leaves the setting to the environment
 * @example
 * ```ts
 * functionReading(HOSTS, () => ["app.example.com"]); // { ok: true, value: … }
 * ```
 */
export function functionReading<TValue>(
  kind: SettingKind<TValue>,
  setting: () => unknown,
): SettingReading<TValue> | typeof FROM_VARIABLE {
  let returned: unknown;
  try {
    returned = setting();
  } catch (error) {
    return failure(kind, "function", `the function threw ${described(error)}`, error);
  }
  if (returned === undefined) return FROM_VARIABLE;
  if (!isStringList(returned)) {
    return failure(
      kind,
      "function",
      "the function returned something other than a list of strings or undefined",
    );
  }
  return listReading(kind, returned, "function");
}

/**
 * What a variable's value gives: entries separated by commas, spaces and
 * empty entries read past.
 *
 * @param kind - The setting
 * @param value - The variable's value, as the environment holds it
 * @returns The reading
 * @example
 * ```ts
 * variableReading(HOSTS, "app.example.com, *.preview.example.com"); // { ok: true, value: … }
 * ```
 */
export function variableReading<TValue>(
  kind: SettingKind<TValue>,
  value: string,
): SettingReading<TValue> {
  if (value.length > RUNTIME_SETTING_LIMITS.MAX_VARIABLE_LENGTH) {
    return failure(
      kind,
      "variable",
      `the variable is longer than ${RUNTIME_SETTING_LIMITS.MAX_VARIABLE_LENGTH} characters`,
    );
  }
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  if (entries.length === 0) {
    /* A template whose variable was empty writes this; reading it as unset would open the setting. */
    return failure(
      kind,
      "variable",
      `the variable is set and names no entry; unset it, or name the ${kind.entries}, comma-separated`,
    );
  }
  return listReading(kind, entries, "variable");
}

/**
 * What a list of entries gives, from wherever it came.
 *
 * @param kind - The setting
 * @param entries - Its entries
 * @param source - Where they came from, for a message
 * @returns The reading
 * @example
 * ```ts
 * listReading(HOSTS, ["app.example.com"], "config"); // { ok: true, value: … }
 * ```
 */
export function listReading<TValue>(
  kind: SettingKind<TValue>,
  entries: readonly string[],
  source: Source,
): SettingReading<TValue> {
  if (entries.length > RUNTIME_SETTING_LIMITS.MAX_ENTRIES) {
    return failure(
      kind,
      source,
      `the list holds more than ${RUNTIME_SETTING_LIMITS.MAX_ENTRIES} entries`,
    );
  }
  const compiled = kind.compile(entries);
  if ("value" in compiled) return { ok: true, value: compiled.value };
  return failure(
    kind,
    source,
    `the entry ${JSON.stringify(quoted(compiled.entry))} ${compiled.problem}`,
    undefined,
    compiled.code,
  );
}

function failure<TValue>(
  kind: SettingKind<TValue>,
  source: Source,
  detail: string,
  cause?: unknown,
  code: ConfigurationErrorCode = "RUNTIME_SETTING_FAILED",
): SettingReading<TValue> {
  const from =
    source === "config"
      ? "the config"
      : source === "function"
        ? "the config's function"
        : RUNTIME_SETTING_VARIABLES[kind.name];
  const message = `${kind.name}, as ${from} gives it: ${detail}`;
  return { ok: false, error: new ConfigurationError(code, message, { cause }) };
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/* What was thrown, in a line: an error by its name and the first line of its message, anything
   else as text. */
function described(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : thrownText(error);
  return quoted(text.split("\n", 1)[0] ?? "");
}

/* A text quoted in a message, cut where a word ends past its length. */
function quoted(text: string): string {
  return wordsUpTo(text, RUNTIME_SETTING_LIMITS.MAX_QUOTED_LENGTH);
}

/* A value thrown that is no error, as text: Node's inspector writes one with no string form of its
   own, which would throw again when made one; where the runtime has none, its kind stands for it. */
function thrownText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof process !== "undefined" && typeof process.getBuiltinModule === "function") {
    const { inspect } = process.getBuiltinModule("node:util");
    return inspect(value, { depth: 2, breakLength: Number.POSITIVE_INFINITY });
  }
  try {
    return String(value);
  } catch {
    return `a ${typeof value} with no text of its own`;
  }
}
