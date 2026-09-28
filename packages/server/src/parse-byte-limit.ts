/**
 * Read a byte limit the user supplied in the config.
 *
 * The config is a TypeScript file the compiler may never have checked — a
 * `.js` config, or one run without a type check — so `"10mb"` or `-1` can
 * reach here. Passed on, a string compared as `NaN` and refused nothing, and
 * a negative limit refused every body. The message names the key, so the
 * mistake is found where it was made.
 *
 * @param value - The value as written, or `undefined` when absent.
 * @param source - Where it was written, for the message.
 * @returns The limit, `undefined` when none was set, or an Error describing
 *   why the value is not a limit.
 *
 * @example
 * ```ts
 * parseByteLimit(1_048_576, "server.maxBodyBytes"); // → 1048576
 * parseByteLimit("10mb", "server.maxUploadBytes"); // → Error
 * ```
 */
export function parseByteLimit(value: unknown, source: string): number | undefined | Error {
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  return new Error(
    `Invalid ${source}: ${JSON.stringify(value)}. A body limit is a whole number of bytes above 0.`,
  );
}
