import { isInheritedName } from "../parser/inherited-names";
import type { ParsedSchema, ParsedSchemaProperty } from "../parser/types";

type SchemaNode = ParsedSchema | ParsedSchemaProperty;

/**
 * Whether the schemas hold an object — one of them, or one anywhere inside
 * them — whose fields include a name every object inherits: it is written
 * through `_ownFields`, which the module that writes it declares. They are
 * walked with a list of their own, however deep they nest.
 *
 * @param schemas - The schemas a module writes
 * @returns Whether any of them holds such an object
 * @example
 * ```ts
 * holdsOwnFields([{ name: "Thing", type: "object", properties: { constructor: text } }]); // true
 * ```
 */
export function holdsOwnFields(schemas: Iterable<SchemaNode | null | undefined>): boolean {
  const pending: SchemaNode[] = [];
  for (const schema of schemas) if (schema) pending.push(schema);
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if ("properties" in node && node.type === "object" && node.properties) {
      if (Object.keys(node.properties).some(isInheritedName)) return true;
      for (const property of Object.values(node.properties)) pending.push(property);
    }
    if (node.items) pending.push(node.items);
    if (node.valueType) pending.push(node.valueType);
    if ("shape" in node && node.shape) pending.push(node.shape);
    if ("variants" in node && node.variants)
      for (const variant of node.variants) pending.push(variant);
  }
  return false;
}
