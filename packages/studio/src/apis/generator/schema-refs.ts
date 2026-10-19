/**
 * Schema ref utilities: topological sorting, ref collection, transitive deps.
 */

import { ownValue } from "../own-value";
import type { ParsedGroup, ParsedSchema, ParsedSpec } from "../parser/types";

/**
 * Order schemas so each comes after every schema it names, in the order a
 * depth-first walk from each name in turn finishes them. The walk keeps a
 * list of its own rather than the call stack, so a chain of references as
 * long as a specification can make is ordered as surely as a short one.
 *
 * @param schemas - The schemas, by name
 * @returns Each name with its schema, dependencies first
 * @example
 * ```ts
 * topoSortSchemas({ Pet: refersToTag, Tag: tag }).map(([name]) => name); // ["Tag", "Pet"]
 * ```
 */
export function topoSortSchemas(schemas: Record<string, ParsedSchema>): [string, ParsedSchema][] {
  const names = new Set(Object.keys(schemas));
  const visited = new Set<string>();
  const result: [string, ParsedSchema][] = [];
  const depsOf = (schema: ParsedSchema): string[] => {
    const refs = new Set<string>();
    collectRefsDeep(schema, refs);
    return [...refs].filter((ref) => names.has(ref));
  };
  for (const root of names) {
    const frames: Array<{ name: string; schema: ParsedSchema; deps: string[]; at: number }> = [];
    const enter = (name: string): void => {
      if (visited.has(name)) return;
      visited.add(name);
      const schema = ownValue(schemas, name);
      if (schema) frames.push({ name, schema, deps: depsOf(schema), at: 0 });
    };
    enter(root);
    for (let frame = frames.at(-1); frame !== undefined; frame = frames.at(-1)) {
      const dep = frame.deps[frame.at];
      frame.at += 1;
      if (dep !== undefined) enter(dep);
      else {
        frames.pop();
        result.push([frame.name, frame.schema]);
      }
    }
  }
  return result;
}

/**
 * Every schema name referenced anywhere inside `schema`, however deep.
 *
 * A `$ref` can sit inside an inline object nested inside an array inside a
 * property. Box's AI request does exactly that, and a walk that stopped one
 * level down emitted the referenced type name without ever emitting the type:
 * the generated module named `AiExtractSubField` and nothing declared it.
 *
 * @param schema - Schema to walk; `null` and `undefined` are ignored
 * @param into - Set the names are added to
 */
export function collectRefsDeep(schema: ParsedSchema | null | undefined, into: Set<string>): void {
  /* What is left to do, the next of it last. Each schema's work is laid down in reverse, so
     names are added in the order a walk down each schema in turn reaches them, however deep. */
  const pending: Work[] = schema ? [{ schema }] : [];
  /* A recursive schema refers to itself; identity is what stops the walk. */
  const seen = new Set<ParsedSchema>();
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if ("ref" in next) {
      into.add(next.ref);
      continue;
    }
    if (seen.has(next.schema)) continue;
    seen.add(next.schema);
    if (next.schema.refName) into.add(next.schema.refName);
    for (const work of workOf(next.schema).reverse()) pending.push(work);
  }
}

/** A schema to walk, or a field's reference to add. */
type Work = { readonly schema: ParsedSchema } | { readonly ref: string };

/* What walking a schema comes to after its own reference, in order. */
function workOf(schema: ParsedSchema): Work[] {
  const work: Work[] = [];
  const walk = (inner: ParsedSchema | undefined): void => {
    if (inner) work.push({ schema: inner });
  };
  walk(schema.items);
  for (const variant of schema.variants ?? []) walk(variant);
  walk(schema.valueType);
  for (const prop of Object.values(schema.properties ?? {})) {
    if (prop.refName) work.push({ ref: prop.refName });
    walk(prop.items);
    walk(prop.shape);
    walk(prop.valueType);
  }
  return work;
}

/**
 * Every schema a group's endpoints name — in a response, a body or a
 * parameter — with every schema those name in turn.
 *
 * @param group - The group
 * @param spec - The specification, whose schemas are looked up by name
 * @returns The names
 * @example
 * ```ts
 * collectGroupSchemas(petGroup, spec); // Set { "Pet", "Category", "Tag" }
 * ```
 */
export function collectGroupSchemas(group: ParsedGroup, spec: ParsedSpec): Set<string> {
  const direct = new Set<string>();
  for (const ep of group.endpoints) {
    collectRefsDeep(ep.responseSchema, direct);
    collectRefsDeep(ep.requestBody, direct);
    for (const param of ep.parameters) {
      collectRefsDeep(param.items, direct);
      collectRefsDeep(param.schema, direct);
    }
  }
  return withDependencies(direct, spec);
}

/**
 * Names, with every schema they refer to, however deep.
 *
 * @param direct - The names to start from
 * @param spec - The specification, whose schemas are looked up by name
 * @returns The names and all their dependencies
 * @example
 * ```ts
 * withDependencies(new Set(["Pet"]), spec); // Set { "Pet", "Category", "Tag" }
 * ```
 */
export function withDependencies(direct: ReadonlySet<string>, spec: ParsedSpec): Set<string> {
  const all = new Set<string>();
  const queue = [...direct];
  while (queue.length > 0) {
    const name = queue.pop();
    if (!name) continue;
    if (all.has(name)) continue;
    all.add(name);
    const schema = ownValue(spec.schemas, name);
    if (!schema) continue;

    const nested = new Set<string>();
    collectRefsDeep(schema, nested);
    for (const ref of nested) {
      if (!all.has(ref)) queue.push(ref);
    }
  }
  return all;
}
