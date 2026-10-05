import type { NodeReader, SchemaNode } from "./schema-node";

/* An enum or a literal shows its values while they are this few; past that it says `enum`. */
const MAX_VALUES = 4;

function valuesLabel(values: readonly unknown[], kind: "enum" | "literal"): string {
  if (kind === "enum" && values.length > MAX_VALUES) return "enum";
  return values.map((value) => JSON.stringify(value) ?? String(value)).join(" | ");
}

function bareLabel(node: SchemaNode, read: NodeReader): string {
  if (node.kind === "enum" || node.kind === "literal")
    return valuesLabel(node.values ?? [], node.kind);
  if (node.kind === "array") {
    const element = node.element === undefined ? undefined : read(node.element);
    const inner = element ? fieldLabel(element, read) : "unknown";
    return `${inner.includes(" | ") ? `(${inner})` : inner}[]`;
  }
  if (node.kind === "union") {
    const labels = (node.options ?? []).flatMap((option) => {
      const optionNode = read(option);
      return optionNode ? [fieldLabel(optionNode, read)] : [];
    });
    return [...new Set(labels)].join(" | ") || "unknown";
  }
  return node.kind;
}

/**
 * How a field's type reads in the Playground's schema table: `string`,
 * `object[]`, `"express" | "standard"`, `number | null`.
 *
 * @param node - The field's node
 * @param read - The reader its child schemas take
 * @returns The label
 * @example
 * ```ts
 * fieldLabel(readZodV4(z.array(z.string())), readZodV4); // "string[]"
 * ```
 */
export function fieldLabel(node: SchemaNode, read: NodeReader): string {
  const label = bareLabel(node, read);
  return node.nullable && !label.split(" | ").includes("null") ? `${label} | null` : label;
}
