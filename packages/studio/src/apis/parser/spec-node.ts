/**
 * Reading a raw specification, which arrives as JSON or YAML nobody checked:
 * a node is an object whose fields are read here, each as what it must be,
 * and a field that is absent or of another kind reads as absent.
 */

/** An object of a raw specification */
export type SpecNode = { readonly [key: string]: unknown };

/**
 * Whether a value is an object of the specification: not `null`, not a list.
 *
 * @param value - Anything read from the specification
 * @returns Whether it is a node
 * @example
 * ```ts
 * isNode({ type: "string" }); // → true
 * isNode(["a"]); // → false
 * ```
 */
export function isNode(value: unknown): value is SpecNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A field that is an object.
 *
 * @param node - The node, or anything else
 * @param key - The field
 * @returns The object, or `undefined`
 * @example
 * ```ts
 * nodeAt(operation, "requestBody");
 * ```
 */
export function nodeAt(node: unknown, key: string): SpecNode | undefined {
  const value = fieldOf(node, key);
  return isNode(value) ? value : undefined;
}

/**
 * A field that is text.
 *
 * @param node - The node, or anything else
 * @param key - The field
 * @returns The text, or `undefined`
 * @example
 * ```ts
 * textAt(schema, "$ref"); // "#/components/schemas/Pet"
 * ```
 */
export function textAt(node: unknown, key: string): string | undefined {
  const value = fieldOf(node, key);
  return typeof value === "string" ? value : undefined;
}

/**
 * A field that is a list.
 *
 * @param node - The node, or anything else
 * @param key - The field
 * @returns The list; empty when the field is absent or not a list
 * @example
 * ```ts
 * listAt(schema, "enum"); // ["available", "sold"]
 * ```
 */
export function listAt(node: unknown, key: string): readonly unknown[] {
  const value = fieldOf(node, key);
  return Array.isArray(value) ? value : [];
}

/**
 * The objects of a list field, leaving out whatever else it holds.
 *
 * @param node - The node, or anything else
 * @param key - The field
 * @returns The objects, in order
 * @example
 * ```ts
 * nodesAt(operation, "parameters");
 * ```
 */
export function nodesAt(node: unknown, key: string): SpecNode[] {
  return listAt(node, key).filter(isNode);
}

/**
 * The entries of a field that maps names to objects, leaving out the ones
 * that are not objects.
 *
 * @param node - The node, or anything else
 * @param key - The field
 * @returns The entries, in the file's order
 * @example
 * ```ts
 * entriesAt(schema, "properties"); // [["name", { type: "string" }], …]
 * ```
 */
export function entriesAt(node: unknown, key: string): Array<[string, SpecNode]> {
  const map = nodeAt(node, key);
  if (!map) return [];
  return Object.entries(map).flatMap(
    ([name, value]): Array<[string, SpecNode]> => (isNode(value) ? [[name, value]] : []),
  );
}

/**
 * A field, whatever it holds.
 *
 * @param node - The node, or anything else
 * @param key - The field
 * @returns Its value, or `undefined` when the node has no such field of its own
 * @example
 * ```ts
 * fieldOf(schema, "default");
 * ```
 */
export function fieldOf(node: unknown, key: string): unknown {
  return isNode(node) && Object.hasOwn(node, key) ? node[key] : undefined;
}

/**
 * A value read as a node: itself when it is an object, and otherwise an
 * empty node, with no field — as a field asked of a `true` schema, or of any
 * other value, reads as absent.
 *
 * @param value - Anything read from the specification
 * @returns The node
 * @example
 * ```ts
 * asNode(true); // → {}
 * ```
 */
export function asNode(value: unknown): SpecNode {
  return isNode(value) ? value : {};
}
