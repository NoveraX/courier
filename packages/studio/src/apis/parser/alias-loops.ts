import { ownValue } from "../own-value";
import { stronglyConnected } from "../strongly-connected";
import type { ParsedSchema } from "./types";

/**
 * Read each schema on a loop of references a value takes as it is — a
 * reference to another schema, or a union holding one, until the chain
 * comes back: `X: { $ref: X }`, `A: B` beside `B: A`, `X: oneOf [X, Y]` —
 * as what the loop can only be. Every schema of such a loop takes the same
 * values, those its schemas take besides one another, so `X: oneOf [X, Y]`
 * is `Y`; a loop that takes nothing else, or `null` alone, names no value,
 * so every value is one, and it is read as unknown. Written out, each was
 * a type that referred to itself, which no project compiles. A schema that
 * refers into the loop from outside stays a reference to it, and one that
 * names itself inside a field or a list stays as it is.
 *
 * @param schemas - The component schemas, by identifier
 * @returns The same schemas, those on a loop read as what it takes
 * @example
 * ```ts
 * withoutAliasLoops({ Tag: { name: "Tag", type: "ref", refName: "Tag" } });
 * // → { Tag: { name: "Tag", type: "any" } }
 * ```
 */
export function withoutAliasLoops(
  schemas: Record<string, ParsedSchema>,
): Record<string, ParsedSchema> {
  const targets = (name: string): string[] => immediateRefs(ownValue(schemas, name));
  const loops = stronglyConnected(Object.keys(schemas), targets).filter(
    (set) => set.length > 1 || set.some((name) => targets(name).includes(name)),
  );
  if (loops.length === 0) return schemas;
  const read: Record<string, ParsedSchema> = { ...schemas };
  for (const loop of loops) {
    const members = new Set(loop);
    const besides = distinct(
      loop.flatMap((name) => variantsBesides(ownValue(schemas, name), members)),
    );
    for (const name of loop)
      read[name] = loopRead(name, ownValue(schemas, name)?.description, besides);
  }
  return read;
}

/* The schemas a value of this one is, as it is: what it refers to, or what its union's variants do. */
function immediateRefs(schema: ParsedSchema | undefined): string[] {
  if (schema?.type === "ref") return schema.refName === undefined ? [] : [schema.refName];
  if (schema?.type !== "union") return [];
  return (schema.variants ?? []).flatMap((variant) =>
    variant.type === "ref" && variant.refName !== undefined ? [variant.refName] : [],
  );
}

/* A union's variants that are not a reference back into the loop. */
function variantsBesides(
  schema: ParsedSchema | undefined,
  loop: ReadonlySet<string>,
): ParsedSchema[] {
  if (schema?.type !== "union") return [];
  return (schema.variants ?? []).filter(
    (variant) =>
      !(variant.type === "ref" && variant.refName !== undefined && loop.has(variant.refName)),
  );
}

/* Each variant once, however many schemas of the loop hold it, its name aside. */
function distinct(variants: readonly ParsedSchema[]): ParsedSchema[] {
  const seen = new Set<string>();
  return variants.filter((variant) => {
    const { name: _name, ...shape } = variant;
    const key = JSON.stringify(shape);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* A schema of the loop, as what the loop takes: unknown, the one schema, or a union of them. */
function loopRead(
  name: string,
  description: string | undefined,
  besides: readonly ParsedSchema[],
): ParsedSchema {
  const described = description === undefined ? {} : { description };
  if (besides.every((variant) => variant.type === "null"))
    return { name, type: "any", ...described };
  const [sole] = besides;
  if (besides.length === 1 && sole !== undefined) return { ...sole, name, ...described };
  const variants = besides.map((variant, at) => ({ ...variant, name: `${name}Variant${at + 1}` }));
  return { name, type: "union", variants, ...described };
}
