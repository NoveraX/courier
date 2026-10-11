import type { CourierImportSpecType } from "@noverax/courier/config";

import type { ParsedSpec } from "../apis";
import { DEFAULT_OPTIONS } from "../apis/generator/types";

const SPEC_TYPES: ReadonlyMap<string, CourierImportSpecType> = new Map([
  ["openapi3", "openapi"],
  ["swagger2", "swagger"],
  ["postman", "postman"],
]);

/**
 * The type an import of a parsed specification is declared with.
 *
 * @param spec - The specification as Studio parsed it
 * @returns `openapi`, `swagger` or `postman`
 * @example
 * ```ts
 * specTypeOf(parseSpec(swagger2Text)); // "swagger"
 * ```
 */
export function specTypeOf(spec: ParsedSpec): CourierImportSpecType {
  return SPEC_TYPES.get(spec.format) ?? DEFAULT_OPTIONS.type;
}
