import type { ParsedSchema } from "./types";

/** What a schema holds itself, not following the references it makes. */
export interface SchemaTraits {
  /** A field travels one way only: readOnly or writeOnly. */
  directed: boolean;
  /** A value in it is constrained beyond its type. */
  constrained: boolean;
  /** The schemas it refers to, by name. */
  refs: Set<string>;
}

/**
 * Read what a schema holds itself — its own fields, items, map values and
 * alternatives, at any depth — without following the references it makes,
 * which are gathered instead.
 *
 * @param schema - The schema
 * @returns Whether it has a directed field or a constrained value, and what it refers to
 * @example
 * ```ts
 * schemaTraits(user); // → { directed: true, constrained: false, refs: Set { "Address" } }
 * ```
 */
export function schemaTraits(schema: ParsedSchema): SchemaTraits {
  const traits: SchemaTraits = { directed: false, constrained: false, refs: new Set() };
  walk(schema, traits);
  return traits;
}

function walk(schema: ParsedSchema, traits: SchemaTraits): void {
  if (schema.refName) traits.refs.add(schema.refName);
  if (schema.constraints) traits.constrained = true;
  for (const prop of Object.values(schema.properties ?? {})) {
    if (prop.direction !== undefined) traits.directed = true;
    if (prop.constraints) traits.constrained = true;
    if (prop.refName) traits.refs.add(prop.refName);
    for (const part of [prop.items, prop.shape, prop.valueType]) if (part) walk(part, traits);
  }
  for (const part of [schema.items, schema.valueType, ...(schema.variants ?? [])]) {
    if (part) walk(part, traits);
  }
}

/**
 * The schemas with a trait, themselves or through a schema they refer to.
 *
 * @param traits - Each schema's own traits, by name
 * @param has - Whether a schema's own traits count
 * @returns The names of the schemas that have it, or refer to one that does
 * @example
 * ```ts
 * withTrait(traits, (own) => own.directed); // → Set { "User", "Order" }
 * ```
 */
export function withTrait(
  traits: ReadonlyMap<string, SchemaTraits>,
  has: (own: SchemaTraits) => boolean,
): Set<string> {
  const found = new Set([...traits].filter(([, own]) => has(own)).map(([name]) => name));
  for (let grown = true; grown; ) {
    grown = false;
    for (const [name, own] of traits) {
      if (found.has(name) || ![...own.refs].some((ref) => found.has(ref))) continue;
      found.add(name);
      grown = true;
    }
  }
  return found;
}
