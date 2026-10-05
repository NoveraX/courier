import type { Settings } from "./types";

type Check<TValue> = (value: unknown) => value is TValue;

const isBoolean: Check<boolean> = (value): value is boolean => typeof value === "boolean";

const isCount: Check<number> = (value): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isTextList: Check<string[]> = (value): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

function oneOf<const TValue extends string | number>(...allowed: TValue[]): Check<TValue> {
  return (value): value is TValue => allowed.some((option) => option === value);
}

/* A check for every field, so a field added to the settings needs one here. */
const CHECKS: { [TKey in keyof Settings]: Check<Settings[TKey]> } = {
  theme: oneOf("dark", "light", "system"),
  maxRequests: isCount,
  preserveLog: isBoolean,
  ignorePatterns: isTextList,
  timestampFormat: oneOf("relative", "absolute"),
  jsonIndent: oneOf(2, 4),
  toastOnError: isBoolean,
  toastOnSlowRequest: isBoolean,
  slowRequestThreshold: isCount,
  storageWarnMb: isCount,
  toastOnFileChange: isBoolean,
  autoReconnect: isBoolean,
  reconnectDelay: isCount,
  defaultExportFormat: oneOf("har", "json", "postman"),
  apisValidation: oneOf("zod", "valibot", "arktype", "none"),
  apisGroupBy: oneOf("tag", "path", "single"),
  apisGenerateTypes: isBoolean,
  apisGenerateSchemas: isBoolean,
  apisIncludeComments: isBoolean,
  apisClient: oneOf("direct", "proxy", "both", "none"),
};

/**
 * The settings a page kept, read back field by field.
 *
 * What the browser kept may come from an older Studio, or be edited by hand:
 * a field is taken only while it holds a value the field accepts, and the
 * default stands for any other — a theme since removed, a count written as
 * text. Spread over the defaults unchecked, such a value reached the store.
 *
 * @param stored - What was kept, parsed
 * @param defaults - The value of each field nothing valid was kept for
 * @returns Complete settings
 * @example
 * ```ts
 * storedSettings({ theme: "light", maxRequests: "lots" }, DEFAULT_SETTINGS)
 * // → { ...DEFAULT_SETTINGS, theme: "light" }
 * ```
 */
export function storedSettings(stored: unknown, defaults: Settings): Settings {
  const settings = { ...defaults };
  if (typeof stored === "object" && stored !== null) keepChecked(settings, CHECKS, stored);
  return settings;
}

function keepChecked<TFields extends object>(
  fields: TFields,
  checks: { [TKey in keyof TFields]: Check<TFields[TKey]> },
  stored: object,
): void {
  for (const key in checks) {
    const value: unknown = Reflect.get(stored, key);
    const check = checks[key];
    if (check(value)) fields[key] = value;
  }
}
