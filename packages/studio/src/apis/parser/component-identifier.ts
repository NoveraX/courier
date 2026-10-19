/**
 * The identifier a component schema is declared and referenced by.
 */

import { toSafeIdentifier } from "./naming-utils";
import { componentSchemaName } from "./ref-utils";
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
  return tableOf(spec).get(component) ?? toSafeIdentifier(component);
}

/**
 * The component schema a reference names, when the specification declares
 * it. A reference to one it does not declare points nowhere: referred to by
 * name, it became code naming a type nothing declared.
 *
 * @param ref - The reference
 * @param spec - The whole specification; without one, any component named is taken
 * @returns The component's name, or `undefined` for a reference that names
 *   no declared component
 * @example
 * ```ts
 * declaredComponentName("#/components/schemas/Pet", spec); // → "Pet"
 * declaredComponentName("#/components/schemas/Missing", spec); // → undefined
 * ```
 */
export function declaredComponentName(ref: string, spec: SpecNode | undefined): string | undefined {
  const component = componentSchemaName(ref);
  if (component === undefined || spec === undefined) return component;
  return tableOf(spec).has(component) ? component : undefined;
}

/**
 * Every identifier the specification's component schemas are declared by.
 *
 * @param spec - The whole specification
 * @returns The identifiers
 * @example
 * ```ts
 * componentIdentifiers(spec).has("OrderItem2"); // → true, beside "OrderItem"
 * ```
 */
export function componentIdentifiers(spec: SpecNode): ReadonlySet<string> {
  return new Set(tableOf(spec).values());
}

function tableOf(spec: SpecNode): ReadonlyMap<string, string> {
  let table = TABLES.get(spec);
  if (!table) {
    table = identifierTable(spec);
    TABLES.set(spec, table);
  }
  return table;
}

function identifierTable(spec: SpecNode): ReadonlyMap<string, string> {
  const names = Object.keys(nodeAt(nodeAt(spec, "components"), "schemas") ?? {});
  /* A schema's constant is its identifier and `Schema`. A component named
     like another's constant — `PetSchema` beside `Pet` — was imported twice
     under one name where both are used. */
  const constants = new Set(names.map((name) => `${toSafeIdentifier(name)}Schema`));
  const table = new Map<string, string>();
  const taken = new Set<string>();
  for (const name of names) {
    const base = toSafeIdentifier(name);
    let identifier = base;
    for (let n = 2; taken.has(identifier) || constants.has(identifier); n += 1) {
      identifier = `${base}${n}`;
    }
    taken.add(identifier);
    table.set(name, identifier);
  }
  return table;
}
