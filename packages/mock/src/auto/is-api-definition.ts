import type { AnyDefinedApi } from "@noverax/courier/define";

/**
 * Whether a value is what `defineApi()` returns: an object carrying the
 * API's options, from which its server's address and its endpoints are read.
 *
 * @param value - The value a mock was given as its source
 * @returns Whether it is an API definition
 * @example
 * ```ts
 * isApiDefinition(defineApi({ baseURL: "https://api.example", groups: {} })); // → true
 * ```
 */
export function isApiDefinition(value: unknown): value is AnyDefinedApi {
  if (typeof value !== "object" || value === null) return false;
  const options: unknown = Reflect.get(value, "options");
  return typeof options === "object" && options !== null;
}
