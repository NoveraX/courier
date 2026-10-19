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
import { stronglyConnected } from "../strongly-connected";
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
 * It walks with a list of its own, so a chain of references of any length is
 * walked once.
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
  const targets = (name: string): string[] => edges.get(name) ?? [];
  return stronglyConnected(Object.keys(schemas), targets).map((names) => ({
    names,
    cyclic: names.length > 1 || names.some((name) => targets(name).includes(name)),
  }));
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
