import type { ParsedSchema } from "./types";

/**
 * Read as unknown each schema that stands only for itself: one that is a
 * reference to another schema, and that one to another, until the chain
 * comes back — `X: { $ref: X }`, `A: B` beside `B: A`, any of them `null`
 * too. Such a schema names no value, so every value is one; written out,
 * it was a type that referred to itself, which no project compiles. A
 * schema that refers into the loop from outside stays a reference to it.
 *
 * @param schemas - The component schemas, by identifier
 * @returns The same schemas, those in a loop read as unknown
 * @example
 * ```ts
 * withoutAliasLoops({ Tag: { name: "Tag", type: "ref", refName: "Tag" } });
 * // → { Tag: { name: "Tag", type: "any" } }
 * ```
 */
export function withoutAliasLoops(
  schemas: Record<string, ParsedSchema>,
): Record<string, ParsedSchema> {
  const looping = aliasLoops(schemas);
  if (looping.size === 0) return schemas;
  const read: Record<string, ParsedSchema> = { ...schemas };
  for (const name of looping) {
    const description = schemas[name]?.description;
    read[name] = { name, type: "any", ...(description !== undefined && { description }) };
  }
  return read;
}

/* The schemas on a chain of references that comes back to itself; each is walked once. */
function aliasLoops(schemas: Record<string, ParsedSchema>): Set<string> {
  const looping = new Set<string>();
  const settled = new Set<string>();
  for (const start of Object.keys(schemas)) {
    const walked: string[] = [];
    const onWalk = new Set<string>();
    let at: string | undefined = start;
    while (at !== undefined && !settled.has(at) && !onWalk.has(at)) {
      walked.push(at);
      onWalk.add(at);
      at = aliasOf(Object.hasOwn(schemas, at) ? schemas[at] : undefined);
    }
    if (at !== undefined && onWalk.has(at)) {
      for (const name of walked.slice(walked.indexOf(at))) looping.add(name);
    }
    for (const name of walked) settled.add(name);
  }
  return looping;
}

/* The schema another one only stands for: its reference, alone or beside `null`. */
function aliasOf(schema: ParsedSchema | undefined): string | undefined {
  if (schema?.type === "ref") return schema.refName;
  if (schema?.type !== "union" || schema.variants?.length !== 2) return undefined;
  const [first, second] = schema.variants;
  if (first?.type === "ref" && second?.type === "null") return first.refName;
  if (second?.type === "ref" && first?.type === "null") return second.refName;
  return undefined;
}
