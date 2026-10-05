import { member } from "../member";
import type { NodeReader } from "./schema-node";
import { fieldsOf, listOf, nodeOf, scalarKind, valuesOf, withFlag } from "./schema-node";

/**
 * Reads a Valibot schema from its own properties: `type`, and what the type
 * keeps — `wrapped`, `entries`, `item`, `options`.
 *
 * @param schema - The schema
 * @returns Its node, or `undefined` for a schema that is not Valibot's
 * @example
 * ```ts
 * readValibot(v.optional(v.number())); // { kind: "number", optional: true, … }
 * ```
 */
export const readValibot: NodeReader = (schema) => {
  if (member(schema, "kind") !== "schema") return undefined;
  const type = member(schema, "type");
  const wrapped = () => readValibot(member(schema, "wrapped"));
  switch (type) {
    case "optional":
    case "exact_optional":
    case "undefinedable":
      return withFlag(wrapped(), "optional");
    case "nullable":
      return withFlag(wrapped(), "nullable");
    case "nullish":
      return withFlag(withFlag(wrapped(), "optional"), "nullable");
    case "object":
    case "loose_object":
    case "strict_object":
    case "object_with_rest":
      return nodeOf("object", { fields: fieldsOf(member(schema, "entries")) });
    case "array":
      return nodeOf("array", { element: member(schema, "item") });
    case "picklist":
      return nodeOf("enum", { values: listOf(member(schema, "options")) });
    case "enum":
      return nodeOf("enum", { values: valuesOf(member(schema, "enum")) });
    case "literal":
      return nodeOf("literal", { values: [member(schema, "literal")] });
    case "union":
    case "variant":
      return nodeOf("union", { options: listOf(member(schema, "options")) });
    case "record":
      return nodeOf("record");
    default:
      return nodeOf(scalarKind(type) ?? "unknown");
  }
};
