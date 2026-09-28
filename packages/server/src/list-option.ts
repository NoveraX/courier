/**
 * A list the command takes as a comma-separated flag, or from the config.
 *
 * The flag wins when it is given, as every flag does over the config's
 * `server` block; blank entries — a trailing comma — are dropped.
 *
 * @param flag - The flag's value, when given.
 * @param configured - The config's list, when it has one.
 * @returns The list, or `undefined` when neither names one.
 *
 * @example
 * ```ts
 * listOption("a.example, b.example,", undefined); // → ["a.example", "b.example"]
 * listOption(undefined, ["app.example.com"]); // → ["app.example.com"]
 * ```
 */
export function listOption(
  flag: string | undefined,
  configured: readonly string[] | undefined,
): string[] | undefined {
  if (flag === undefined) return configured === undefined ? undefined : [...configured];
  return flag
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
