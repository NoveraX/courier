/**
 * A socket event's field when it holds one of `allowed`, or `undefined`.
 *
 * @param value - The field as the socket parsed it
 * @param allowed - The values the field may hold
 * @returns The value, or `undefined`
 * @example
 * ```ts
 * readOneOf("3g", ["none", "3g"] as const); // → "3g"
 * ```
 */
export function readOneOf<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
): TValue | undefined {
  return allowed.find((candidate) => candidate === value);
}
