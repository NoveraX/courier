/**
 * Find the schemas that take part in a reference cycle.
 *
 * A specification is free to describe a type in terms of itself — Stripe's
 * treasury objects refer to each other in both directions. Emitted in
 * declaration order, the first of them reads a constant the second has not
 * reached yet: TypeScript reports "used before its declaration" and the module
 * throws the moment it is imported.
 *
 * A schema listed here has to be emitted lazily, so nothing is read until the
 * whole file has finished evaluating.
 */

import type { ParsedSchema } from "../parser/types";
import { collectRefsDeep } from "./schema-refs";

/**
 * Names that cannot be ordered so every reference points backwards.
 *
 * @param schemas - Schemas about to be written to one file
 * @returns The names on a cycle, including schemas that refer to themselves
 *
 * @example
 * ```ts
 * findCyclicSchemas({ Node: nodeWithChildrenOfNode }) // → Set { "Node" }
 * ```
 */
export function findCyclicSchemas(schemas: Record<string, ParsedSchema>): Set<string> {
  const known = new Set(Object.keys(schemas));
  const edges = new Map<string, string[]>();
  for (const [name, schema] of Object.entries(schemas)) {
    const refs = new Set<string>();
    collectRefsDeep(schema, refs);
    edges.set(
      name,
      [...refs].filter((ref) => known.has(ref)),
    );
  }

  const cyclic = new Set<string>();
  const settled = new Set<string>();
  const onPath: string[] = [];
  const pathIndex = new Map<string, number>();

  function visit(name: string): void {
    if (settled.has(name)) return;

    const seenAt = pathIndex.get(name);
    if (seenAt !== undefined) {
      /* Everything from where this name first appeared is on the cycle. */
      for (const member of onPath.slice(seenAt)) cyclic.add(member);
      return;
    }

    pathIndex.set(name, onPath.length);
    onPath.push(name);
    for (const next of edges.get(name) ?? []) visit(next);
    onPath.pop();
    pathIndex.delete(name);
    settled.add(name);
  }

  for (const name of known) visit(name);
  return cyclic;
}
