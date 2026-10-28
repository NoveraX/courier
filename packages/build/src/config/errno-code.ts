/**
 * The `code` a Node system error carries, such as `ENOENT` or `EACCES`.
 *
 * @param error - Anything thrown
 * @returns The code, or `undefined` when the value carries none
 * @example
 * ```ts
 * if (errnoCode(err) === "ENOENT") return null;
 * ```
 */
export function errnoCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}
