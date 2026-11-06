import { isRecord } from "../../util/is-record";

/** A node of oxc's tree, as the codemods read it: its type, its span in the text, and its fields. */
export interface AstNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly [field: string]: unknown;
}

/**
 * Whether a value is a node of oxc's tree.
 *
 * @param value - A field's value
 * @returns Whether it has a type and a span
 * @example
 * ```ts
 * isNode(program.body[0]); // true
 * ```
 */
export function isNode(value: unknown): value is AstNode {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    typeof value.start === "number" &&
    typeof value.end === "number"
  );
}

/** A node, the nodes above it — the nearest last — and the field of its parent it is under. */
export interface Visited {
  readonly node: AstNode;
  readonly ancestors: readonly AstNode[];
  readonly key: string;
}

/* The children of a node, each with the field it is under, in the order the fields are written. */
function childrenOf(node: AstNode): Array<{ node: AstNode; key: string }> {
  const children: Array<{ node: AstNode; key: string }> = [];
  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) children.push({ node: item, key });
    } else if (isNode(value)) children.push({ node: value, key });
  }
  return children;
}

/**
 * Visit every node under a root, depth first, each with the nodes above
 * it and the field it is under. The walk keeps its own stack, so a file
 * nested deep does not run out of the call stack.
 *
 * @param root - The program, or any node
 * @param visit - Called for each node
 * @example
 * ```ts
 * walk(program, ({ node }) => node.type === "CallExpression" && calls.push(node));
 * ```
 */
export function walk(root: AstNode, visit: (visited: Visited) => void): void {
  const stack: Visited[] = [{ node: root, ancestors: [], key: "" }];
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    visit(next);
    const ancestors = [...next.ancestors, next.node];
    const children = childrenOf(next.node);
    for (let at = children.length - 1; at >= 0; at--) {
      const child = children[at];
      if (child !== undefined) stack.push({ node: child.node, ancestors, key: child.key });
    }
  }
}

/**
 * A node's name, where it is an identifier: an `Identifier`, or a
 * `JSXIdentifier` that names a component.
 *
 * @param node - The node
 * @returns Its name, or `undefined` for another node
 * @example
 * ```ts
 * nameOf(specifier.local); // "AuthError"
 * ```
 */
export function nameOf(node: unknown): string | undefined {
  if (!isNode(node) || (node.type !== "Identifier" && node.type !== "JSXIdentifier"))
    return undefined;
  return typeof node.name === "string" ? node.name : undefined;
}

/**
 * A program as the codemods read it: oxc's tree, checked to be one.
 *
 * @param program - What oxc gave for the file
 * @returns The tree's root
 * @throws {TypeError} When it is no node, which oxc never gives
 * @example
 * ```ts
 * const root = programOf(parseSource(path, text).program);
 * ```
 */
export function programOf(program: unknown): AstNode {
  if (!isNode(program)) throw new TypeError("oxc gave no program for the file");
  return program;
}
