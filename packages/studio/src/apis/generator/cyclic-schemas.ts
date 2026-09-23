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
import { schemaComponents } from "./schema-components";

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
  const cyclic = new Set<string>();
  for (const component of schemaComponents(schemas)) {
    if (!component.cyclic) continue;
    for (const name of component.names) cyclic.add(name);
  }
  return cyclic;
}
