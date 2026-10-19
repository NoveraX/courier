/**
 * The walks over a specification's references — the names a schema refers
 * to, the order schemas are written in, the sets that refer to each other —
 * keep a list of their own rather than the call stack: they ran out of
 * stack at some 20 000 links, which a deep schema split into named ones
 * makes. Each gives exactly what its recursive form gave, which these tests
 * keep as the oracle, on random graphs and on chains of 100 000.
 */
import { describe, expect, it } from "vitest";

import { schemaComponents } from "../../src/apis/generator/schema-components";
import { collectRefsDeep, topoSortSchemas } from "../../src/apis/generator/schema-refs";
import type { ParsedSchema, ParsedSchemaProperty } from "../../src/apis/parser/types";
import { seededRandom } from "../helpers/seeded-random";

/* The recursive walk, as it was. */
function refsOracle(
  schema: ParsedSchema | null | undefined,
  into: Set<string>,
  seen = new Set<ParsedSchema>(),
): void {
  if (!schema || seen.has(schema)) return;
  seen.add(schema);
  if (schema.refName) into.add(schema.refName);
  refsOracle(schema.items, into, seen);
  for (const variant of schema.variants ?? []) refsOracle(variant, into, seen);
  refsOracle(schema.valueType, into, seen);
  for (const prop of Object.values(schema.properties ?? {})) {
    if (prop.refName) into.add(prop.refName);
    refsOracle(prop.items, into, seen);
    refsOracle(prop.shape, into, seen);
    refsOracle(prop.valueType, into, seen);
  }
}

/* The recursive sort, as it was. */
function sortOracle(schemas: Record<string, ParsedSchema>): string[] {
  const names = new Set(Object.keys(schemas));
  const visited = new Set<string>();
  const result: string[] = [];
  const visit = (name: string): void => {
    if (visited.has(name)) return;
    visited.add(name);
    const schema = schemas[name];
    if (!schema) return;
    const refs = new Set<string>();
    refsOracle(schema, refs);
    for (const dep of [...refs].filter((ref) => names.has(ref))) visit(dep);
    result.push(name);
  };
  for (const name of names) visit(name);
  return result;
}

/* The recursive Tarjan, as it was. */
function componentsOracle(
  schemas: Record<string, ParsedSchema>,
): Array<{ names: string[]; cyclic: boolean }> {
  const edges = new Map<string, string[]>();
  for (const [name, schema] of Object.entries(schemas)) {
    const refs = new Set<string>();
    refsOracle(schema, refs);
    edges.set(
      name,
      [...refs].filter((ref) => Object.hasOwn(schemas, ref)),
    );
  }
  const order = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: Array<{ names: string[]; cyclic: boolean }> = [];
  const visit = (name: string): void => {
    order.set(name, order.size);
    low.set(name, order.get(name) ?? 0);
    stack.push(name);
    onStack.add(name);
    for (const next of edges.get(name) ?? []) {
      if (!order.has(next)) {
        visit(next);
        low.set(name, Math.min(low.get(name) ?? 0, low.get(next) ?? 0));
      } else if (onStack.has(next)) {
        low.set(name, Math.min(low.get(name) ?? 0, order.get(next) ?? 0));
      }
    }
    if (low.get(name) !== order.get(name)) return;
    const names: string[] = [];
    for (;;) {
      const popped = stack.pop() ?? name;
      onStack.delete(popped);
      names.push(popped);
      if (popped === name) break;
    }
    names.reverse();
    components.push({ names, cyclic: names.length > 1 || (edges.get(name) ?? []).includes(name) });
  };
  for (const name of Object.keys(schemas)) if (!order.has(name)) visit(name);
  return components;
}

/* A random set of schemas that refer to each other through every place a reference can sit,
   a nested object shared between two places among them. */
function randomSchemas(seed: number): Record<string, ParsedSchema> {
  const next = seededRandom(seed);
  const count = 2 + next(12);
  const names = Array.from({ length: count }, (_, at) => `S${at}`);
  const shared: ParsedSchema = { name: "Shared", type: "object", properties: {} };
  const node = (depth: number): ParsedSchema => {
    const pick = next(depth > 3 ? 2 : 6);
    if (pick === 0) return { name: "R", type: "ref", refName: names[next(count)] };
    if (pick === 1) return depth > 1 && next(3) === 0 ? shared : { name: "P", type: "string" };
    if (pick === 2) return { name: "A", type: "array", items: node(depth + 1) };
    if (pick === 3)
      return { name: "U", type: "union", variants: [node(depth + 1), node(depth + 1)] };
    if (pick === 4) return { name: "M", type: "object", valueType: node(depth + 1) };
    const properties: Record<string, ParsedSchemaProperty> = {};
    for (let at = 0; at < 1 + next(3); at += 1) {
      const kind = next(4);
      properties[`p${at}`] =
        kind === 0
          ? { type: "ref", refName: names[next(count)], required: true }
          : kind === 1
            ? { type: "array", items: node(depth + 1), required: false }
            : kind === 2
              ? { type: "object", shape: node(depth + 1), required: true }
              : { type: "object", valueType: node(depth + 1), required: false };
    }
    return { name: "O", type: "object", properties };
  };
  shared.properties = { back: { type: "ref", refName: names[next(count)], required: true } };
  return Object.fromEntries(names.map((name) => [name, { ...node(0), name }]));
}

/* A chain of `length` schemas, each referring to the next. */
function chain(length: number): Record<string, ParsedSchema> {
  return Object.fromEntries(
    Array.from({ length }, (_, at): [string, ParsedSchema] => [
      `S${at}`,
      at + 1 < length
        ? { name: `S${at}`, type: "ref", refName: `S${at + 1}` }
        : { name: `S${at}`, type: "string" },
    ]),
  );
}

describe("the walks over references, without the call stack", () => {
  it("give what their recursive forms gave, in the same order, on 2 000 random graphs", () => {
    for (let seed = 1; seed <= 2_000; seed += 1) {
      const schemas = randomSchemas(seed);
      for (const schema of Object.values(schemas)) {
        const walked = new Set<string>();
        const oracle = new Set<string>();
        collectRefsDeep(schema, walked);
        refsOracle(schema, oracle);
        expect([...walked]).toEqual([...oracle]);
      }
      expect(topoSortSchemas(schemas).map(([name]) => name)).toEqual(sortOracle(schemas));
      expect(schemaComponents(schemas)).toEqual(componentsOracle(schemas));
    }
  });

  it("sort and split a chain of 100 000 references", () => {
    const schemas = chain(100_000);

    const sorted = topoSortSchemas(schemas).map(([name]) => name);
    const components = schemaComponents(schemas);

    expect(sorted[0]).toBe("S99999");
    expect(sorted.at(-1)).toBe("S0");
    expect(components).toHaveLength(100_000);
    expect(components.every((component) => !component.cyclic)).toBe(true);
  });

  it("walk a schema nested 100 000 levels deep", () => {
    let deep: ParsedSchema = { name: "Leaf", type: "ref", refName: "End" };
    for (let at = 0; at < 100_000; at += 1) deep = { name: `L${at}`, type: "array", items: deep };
    const refs = new Set<string>();

    collectRefsDeep(deep, refs);

    expect([...refs]).toEqual(["End"]);
  });
});
