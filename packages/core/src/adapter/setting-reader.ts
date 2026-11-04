import {
  NOT_SET,
  RUNTIME_SETTING_LIMITS,
  RUNTIME_SETTING_VARIABLES,
  type RuntimeSetting,
  type SettingKind,
  type SettingReading,
} from "./runtime-setting";
import { FROM_VARIABLE, functionReading, listReading, variableReading } from "./setting-readings";

/**
 * One setting's reader: each list and function read once, each value of its
 * variable once while it is kept.
 *
 * @param kind - The setting, and how its entries become its value
 * @returns The reader, given the setting as a handler's config holds it
 * @example
 * ```ts
 * const readHosts = settingReader(HOSTS);
 * readHosts(config.allowedHosts); // { ok: true, value: … }
 * ```
 */
export function settingReader<TValue>(
  kind: SettingKind<TValue>,
): (setting: RuntimeSetting<readonly string[]> | undefined) => SettingReading<TValue> {
  const variable = RUNTIME_SETTING_VARIABLES[kind.name];
  const given = new WeakMap<object, SettingReading<TValue> | typeof FROM_VARIABLE>();
  const values = new Map<string, SettingReading<TValue>>();

  const fromVariable = (): SettingReading<TValue> => {
    const value = globalThis.process?.env?.[variable];
    if (value === undefined) return NOT_SET;
    const kept = values.get(value);
    if (kept !== undefined) return kept;
    const reading = variableReading(kind, value);
    if (values.size >= RUNTIME_SETTING_LIMITS.KEPT_VARIABLE_VALUES) {
      for (const oldest of values.keys()) {
        values.delete(oldest);
        break;
      }
    }
    values.set(value, reading);
    return reading;
  };

  return (setting) => {
    if (setting === undefined) return fromVariable();
    let reading = given.get(setting);
    if (reading === undefined) {
      reading =
        typeof setting === "function"
          ? functionReading(kind, setting)
          : listReading(kind, setting, "config");
      given.set(setting, reading);
    }
    return reading === FROM_VARIABLE ? fromVariable() : reading;
  };
}
