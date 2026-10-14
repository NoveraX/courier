import { isRecord } from "@noverax/courier-cli/devkit";

/* Where an identifier names a property, not a binding: a key or a member read through a dot. */
const NAME_SLOTS: ReadonlyMap<string, readonly string[]> = new Map([
  ["Property", ["key"]],
  ["PropertyDefinition", ["key"]],
  ["MethodDefinition", ["key"]],
  ["TSPropertySignature", ["key"]],
  ["TSMethodSignature", ["key"]],
  ["MemberExpression", ["property"]],
  ["TSQualifiedName", ["right"]],
]);

/* Keys that lead back up the tree or hold positions, never child nodes. */
const SKIPPED_KEYS: ReadonlySet<string> = new Set(["parent", "start", "end", "range", "loc"]);

/**
 * The names a piece of code refers to: every identifier it reads, in values
 * and in types, but not a property key or a member read through a dot, and
 * nothing inside a string or a comment.
 *
 * @param node - An AST node, as oxc parses it, or a list of them
 * @param names - Where the names are collected
 * @returns `names`
 * @example
 * ```ts
 * referencedNames(parseSource("a.ts", "const x = { Pet: PetSchema.parse(y) };").program.body, new Set());
 * // → Set { "x", "PetSchema", "y" }
 * ```
 */
export function referencedNames(node: unknown, names: Set<string> = new Set()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) referencedNames(item, names);
    return names;
  }
  if (!isRecord(node)) return names;
  if (node.type === "Identifier" && typeof node.name === "string") {
    names.add(node.name);
    /* A parameter or a binding carries its type on the identifier itself. */
    return referencedNames(node.typeAnnotation, names);
  }
  const nameSlots = typeof node.type === "string" ? NAME_SLOTS.get(node.type) : undefined;
  for (const [key, value] of Object.entries(node)) {
    if (SKIPPED_KEYS.has(key)) continue;
    if (nameSlots?.includes(key) && node.computed !== true) continue;
    referencedNames(value, names);
  }
  return names;
}
