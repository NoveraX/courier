/**
 * The identifier a component schema is declared and referenced by.
 */

import { toSafeIdentifier } from "./naming-utils";
import { nodeAt, type SpecNode } from "./spec-node";

/* One table per specification, built once. */
const TABLES = new WeakMap<SpecNode, ReadonlyMap<string, string>>();

/**
 * The identifier of a component schema, the same for its declaration and for
 * every reference to it.
 *
 * Two names can normalise to one identifier — `OrderItem`, `order-item` and
 * `order_item` all become `OrderItem`. The first the specification declares
 * keeps it and the others are numbered, `OrderItem2` and `OrderItem3`. The
 * declarations were numbered so, but a reference normalised the name on its
 * own, so every reference to `order-item` named `OrderItem`: its answers were
 * typed and validated as the other schema, and refused.
 *
 * @param spec - The whole specification, whose component names decide the numbering
 * @param component - The component's name as the specification writes it
 * @returns The identifier
 * @example
 * ```ts
 * componentIdentifier(spec, "order-item"); // "OrderItem2", beside an earlier "OrderItem"
 * ```
 */
export function componentIdentifier(spec: SpecNode | undefined, component: string): string {
  if (!spec) return toSafeIdentifier(component);
  let table = TABLES.get(spec);
  if (!table) {
    table = identifierTable(spec);
    TABLES.set(spec, table);
  }
  return table.get(component) ?? toSafeIdentifier(component);
}

function identifierTable(spec: SpecNode): ReadonlyMap<string, string> {
  const table = new Map<string, string>();
  const taken = new Set<string>();
  for (const name of Object.keys(nodeAt(nodeAt(spec, "components"), "schemas") ?? {})) {
    const base = toSafeIdentifier(name);
    let identifier = base;
    for (let n = 2; taken.has(identifier); n += 1) identifier = `${base}${n}`;
    taken.add(identifier);
    table.set(name, identifier);
  }
  return table;
}
