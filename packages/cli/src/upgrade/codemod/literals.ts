import { isRecord } from "../../util/is-record";
import { isNode, nameOf } from "./ast";

/**
 * The text a node writes for certain: a string, or a template with
 * nothing put in it.
 *
 * @param node - The node
 * @returns Its text, or `undefined` for any other node
 * @example
 * ```ts
 * stringOf(property.value); // "https://specs.example/pets.json"
 * ```
 */
export function stringOf(node: unknown): string | undefined {
  if (!isNode(node)) return undefined;
  if (node.type === "Literal") return typeof node.value === "string" ? node.value : undefined;
  if (node.type !== "TemplateLiteral" || !Array.isArray(node.quasis)) return undefined;
  if (!Array.isArray(node.expressions) || node.expressions.length > 0) return undefined;
  const [quasi] = node.quasis;
  const cooked = isNode(quasi) && isRecord(quasi.value) ? quasi.value.cooked : undefined;
  return typeof cooked === "string" ? cooked : undefined;
}

/**
 * A key's name, written as an identifier or as a string.
 *
 * @param key - A property's key
 * @returns Its name, or `undefined` for a key computed some other way
 * @example
 * ```ts
 * keyOf(property.key); // "pinHash", for `pinHash:` and `"pinHash":` alike
 * ```
 */
export function keyOf(key: unknown): string | undefined {
  if (isNode(key) && key.type === "Literal" && typeof key.value === "string") return key.value;
  return nameOf(key);
}
