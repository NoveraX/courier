/**
 * Schema ref utilities: topological sorting, ref collection, transitive deps.
 */

import type { ParsedGroup, ParsedSchema, ParsedSpec } from "../parser/types";

/** Topological sort: ensures schemas are emitted after their dependencies */
export function topoSortSchemas(schemas: Record<string, ParsedSchema>): [string, ParsedSchema][] {
  const names = new Set(Object.keys(schemas));
  const visited = new Set<string>();
  const result: [string, ParsedSchema][] = [];

  function getDeps(schema: ParsedSchema): string[] {
    const refs = new Set<string>();
    collectRefsDeep(schema, refs);
    return [...refs].filter((ref) => names.has(ref));
  }

  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    const schema = schemas[name];
    if (!schema) return;
    for (const dep of getDeps(schema)) {
      visit(dep);
    }
    result.push([name, schema]);
  }

  for (const name of names) {
    visit(name);
  }
  return result;
}

export function collectSchemaRefs(schema: ParsedSchema | null, refs: Set<string>): void {
  collectRefsDeep(schema, refs);
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
  walk(schema, into, new Set());
}

function walk(
  schema: ParsedSchema | null | undefined,
  into: Set<string>,
  seen: Set<ParsedSchema>,
): void {
  /* A recursive schema refers to itself; identity is what stops the walk. */
  if (!schema || seen.has(schema)) return;
  seen.add(schema);

  if (schema.refName) into.add(schema.refName);
  walk(schema.items, into, seen);

  for (const prop of Object.values(schema.properties ?? {})) {
    if (prop.refName) into.add(prop.refName);
    walk(prop.items, into, seen);
  }
}

/** Collect all schemas needed by a group, including transitive $ref dependencies */
export function collectGroupSchemas(group: ParsedGroup, spec: ParsedSpec): Set<string> {
  const direct = new Set<string>();
  for (const ep of group.endpoints) {
    collectSchemaRefs(ep.responseSchema, direct);
    collectSchemaRefs(ep.requestBody, direct);
  }

  // Resolve transitive deps: schema properties may reference other schemas
  const all = new Set<string>();
  const queue = [...direct];
  while (queue.length > 0) {
    const name = queue.pop();
    if (!name) continue;
    if (all.has(name)) continue;
    all.add(name);
    const schema = spec.schemas[name];
    if (!schema) continue;

    const nested = new Set<string>();
    collectRefsDeep(schema, nested);
    for (const ref of nested) {
      if (!all.has(ref)) queue.push(ref);
    }
  }
  return all;
}
