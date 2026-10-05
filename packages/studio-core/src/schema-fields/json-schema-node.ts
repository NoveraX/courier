import { member } from "../member";
import type { NodeReader, SchemaNode } from "./schema-node";
import { listOf, nodeOf, scalarKind } from "./schema-node";

function isNull(schema: unknown): boolean {
  return member(schema, "type") === "null";
}

/* A union, or the one option it has besides null. */
function unionOf(options: readonly unknown[]): SchemaNode | undefined {
  const rest = options.filter((option) => !isNull(option));
  const nullable = rest.length < options.length;
  const node = rest.length === 1 ? readJsonSchema(rest[0]) : nodeOf("union", { options: rest });
  return node && { ...node, nullable: node.nullable || nullable };
}

function objectOf(schema: object): SchemaNode {
  const properties = member(schema, "properties");
  if (typeof properties !== "object" || properties === null) return nodeOf("record");
  const required = new Set(listOf(member(schema, "required")));
  const fields = Object.entries(properties).map(([name, field]: [string, unknown]) => ({
    name,
    schema: field,
    optional: !required.has(name),
  }));
  return nodeOf("object", { fields });
}

/**
 * Reads a JSON Schema — what an ArkType type's `toJsonSchema()` gives — from
 * its `type`, `properties` and `required`, `items`, `enum`, `const` and
 * `anyOf` / `oneOf`.
 *
 * @param schema - The JSON Schema
 * @returns Its node, or `undefined` for a value that is not one
 * @example
 * ```ts
 * readJsonSchema({ type: ["string", "null"] }); // { kind: "string", nullable: true, … }
 * ```
 */
export const readJsonSchema: NodeReader = (schema) => {
  if (typeof schema !== "object" || schema === null) return undefined;
  const options = listOf(member(schema, "anyOf") ?? member(schema, "oneOf"));
  if (options.length > 0) return unionOf(options);
  const type = member(schema, "type");
  if (Array.isArray(type)) return unionOf(type.map((one: unknown) => ({ ...schema, type: one })));
  if (member(schema, "const") !== undefined) {
    return nodeOf("literal", { values: [member(schema, "const")] });
  }
  const values = member(schema, "enum");
  if (Array.isArray(values)) return nodeOf("enum", { values });
  if (type === "object") return objectOf(schema);
  if (type === "array") return nodeOf("array", { element: member(schema, "items") });
  return nodeOf(scalarKind(type) ?? "unknown");
};
