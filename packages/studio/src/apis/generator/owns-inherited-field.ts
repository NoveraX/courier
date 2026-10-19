import { isInheritedName } from "../parser/inherited-names";
import type { ParsedSchema } from "../parser/types";

/**
 * Whether an object schema's own fields include a name every object
 * inherits: it is written through `_ownFields`, and the variables that
 * extend it with parameters extend its `fields`.
 *
 * @param schema - The schema
 * @returns Whether it is an object with such a field
 * @example
 * ```ts
 * ownsInheritedField({ name: "Thing", type: "object", properties: { toString: text } }); // true
 * ```
 */
export function ownsInheritedField(schema: ParsedSchema | null | undefined): boolean {
  return schema?.type === "object" && Object.keys(schema.properties ?? {}).some(isInheritedName);
}
