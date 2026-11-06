import type { RuntimeSetting } from "@noverax/courier/server";

/**
 * A list the command takes as a comma-separated flag, or from the config.
 *
 * The flag wins when it is given, as every flag does over the config's
 * `server` block; blank entries — a trailing comma — are dropped. The
 * config's setting is passed on as it is, a list or a function the server
 * calls as it starts; neither given, the server reads the setting's
 * environment variable.
 *
 * @param flag - The flag's value, when given.
 * @param configured - The config's setting, when it has one.
 * @returns The setting, or `undefined` when neither names one.
 *
 * @example
 * ```ts
 * listOption("a.example, b.example,", undefined); // → ["a.example", "b.example"]
 * listOption(undefined, ["app.example.com"]); // → ["app.example.com"]
 * ```
 */
export function listOption(
  flag: string | undefined,
  configured: RuntimeSetting<readonly string[]> | undefined,
): RuntimeSetting<readonly string[]> | undefined {
  if (flag === undefined) return configured;
  return flag
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
