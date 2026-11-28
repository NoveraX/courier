/**
 * One own property of an object: `undefined` where it has none of its own,
 * as `ownFields` reads them all. What a prototype answers for the key is
 * none of the object's.
 *
 * @param value - The options, or nothing
 * @param key - The option
 * @returns Its value
 * @example
 * ```ts
 * ownField(endpointOptions, "timeout"); // what the endpoint's own options say, or undefined
 * ```
 */
export function ownField<T extends object, K extends keyof T>(
  value: T | null | undefined,
  key: K,
): T[K] | undefined {
  return value != null && Object.hasOwn(value, key) ? value[key] : undefined;
}
