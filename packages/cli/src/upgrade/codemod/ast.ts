import { visitorKeys } from "oxc-parser";

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

/**
 * A node, the nodes above it — the nearest last — and the field of its
 * parent it is under. `ancestors` is the walk's own array, true while the
 * visit runs: a visitor that keeps it copies it.
 */
export interface Visited {
  readonly node: AstNode;
  readonly ancestors: readonly AstNode[];
  readonly key: string;
}

/* The fields of a node that hold nodes, by its type, as oxc lists them; every field for a type it does not list. */
function childKeys(node: AstNode): readonly string[] {
  return visitorKeys[node.type] ?? Object.keys(node);
}

/* A node where a walk meets it: how deep, and the field of its parent it is under. */
interface Placed {
  readonly node: AstNode;
  readonly depth: number;
  readonly key: string;
}

/* Each tree's nodes in the order a walk meets them, read the first time it is walked: a tree is never changed, so it stays true. */
const ORDERS = new WeakMap<AstNode, readonly Placed[]>();

/* The nodes under a root, depth first, with a stack of its own, so a file nested deep does not run out of the call stack. */
function orderOf(root: AstNode): readonly Placed[] {
  const known = ORDERS.get(root);
  if (known !== undefined) return known;
  const order: Placed[] = [];
  const stack: Placed[] = [{ node: root, depth: 0, key: "" }];
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    order.push(next);
    const depth = next.depth + 1;
    const keys = childKeys(next.node);
    for (let at = keys.length - 1; at >= 0; at--) {
      const key = keys[at] ?? "";
      const value = next.node[key];
      if (!Array.isArray(value)) {
        if (isNode(value)) stack.push({ node: value, depth, key });
        continue;
      }
      for (let child = value.length - 1; child >= 0; child--) {
        const node: unknown = value[child];
        if (isNode(node)) stack.push({ node, depth, key });
      }
    }
  }
  ORDERS.set(root, order);
  return order;
}

/**
 * Visit every node under a root, depth first, each with the nodes above
 * it and the field it is under. The tree is read once, the first time it
 * is walked, into the order a walk meets its nodes; every walk keeps one
 * array of the nodes above, so a visit costs the same however deep it is.
 *
 * @param root - The program, or any node
 * @param visit - Called for each node
 * @example
 * ```ts
 * walk(program, ({ node }) => node.type === "CallExpression" && calls.push(node));
 * ```
 */
export function walk(root: AstNode, visit: (visited: Visited) => void): void {
  const path: AstNode[] = [];
  for (const { node, depth, key } of orderOf(root)) {
    while (path.length > depth) path.pop();
    visit({ node, ancestors: path, key });
    path.push(node);
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
 * A node without the parentheses written around it, which oxc keeps as
 * nodes of their own.
 *
 * @param node - The node
 * @returns The node inside the parentheses, or the node itself
 * @example
 * ```ts
 * unparenthesized(arrow.body); // the ConditionalExpression of (http, v) => (v.a ? http.get("a") : http.head("b"))
 * ```
 */
export function unparenthesized(node: unknown): unknown {
  let at = node;
  while (isNode(at) && at.type === "ParenthesizedExpression") at = at.expression;
  return at;
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
