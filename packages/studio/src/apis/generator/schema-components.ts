/**
 * Group schemas into the sets that refer to each other.
 *
 * Two schemas belong to one component when each can reach the other through
 * references. Every cycle lies inside a single component, and the components
 * themselves never form a cycle — so they can always be written one after
 * another with every reference pointing backwards, which a flat list of
 * schemas on a cycle cannot.
 */

import type { ParsedSchema } from "../parser/types";
import { collectRefsDeep } from "./schema-refs";

/** One component: a single schema, or several that name each other. */
export interface SchemaComponent {
  /** Names in the component. */
  names: string[];
  /** Whether it refers to itself — a cycle, or a schema naming itself. */
  cyclic: boolean;
}

/**
 * Split schemas into components, each listed after every component it names.
 *
 * Tarjan's algorithm closes a component only once everything it reaches has
 * been closed, so the order it produces is already the order to write them in.
 *
 * @param schemas - Schemas about to be written to one file
 * @returns Components in declaration order
 *
 * @example
 * ```ts
 * schemaComponents({ Node: nodeOfNodes, Leaf: leaf })
 * // → [{ names: ["Leaf"], cyclic: false }, { names: ["Node"], cyclic: true }]
 * ```
 */
export function schemaComponents(schemas: Record<string, ParsedSchema>): SchemaComponent[] {
  const edges = referenceEdges(schemas);
  const order = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: SchemaComponent[] = [];

  function visit(name: string): void {
    order.set(name, order.size);
    low.set(name, order.get(name) as number);
    stack.push(name);
    onStack.add(name);

    for (const next of edges.get(name) ?? []) {
      if (!order.has(next)) {
        visit(next);
        low.set(name, Math.min(low.get(name) as number, low.get(next) as number));
      } else if (onStack.has(next)) {
        low.set(name, Math.min(low.get(name) as number, order.get(next) as number));
      }
    }

    if (low.get(name) !== order.get(name)) return;
    components.push(closeComponent(name, stack, onStack, edges));
  }

  for (const name of Object.keys(schemas)) {
    if (!order.has(name)) visit(name);
  }
  return components;
}

/** Pop the finished component off the stack. */
function closeComponent(
  root: string,
  stack: string[],
  onStack: Set<string>,
  edges: Map<string, string[]>,
): SchemaComponent {
  const names: string[] = [];
  for (;;) {
    const name = stack.pop() as string;
    onStack.delete(name);
    names.push(name);
    if (name === root) break;
  }
  names.reverse();
  const cyclic = names.length > 1 || (edges.get(root) ?? []).includes(root);
  return { names, cyclic };
}

/** Which schemas in the file each schema names. */
function referenceEdges(schemas: Record<string, ParsedSchema>): Map<string, string[]> {
  const edges = new Map<string, string[]>();
  for (const [name, schema] of Object.entries(schemas)) {
    const refs = new Set<string>();
    collectRefsDeep(schema, refs);
    edges.set(
      name,
      [...refs].filter((ref) => Object.hasOwn(schemas, ref)),
    );
  }
  return edges;
}
