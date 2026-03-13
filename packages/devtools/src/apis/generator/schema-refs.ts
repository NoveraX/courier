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
    const deps: string[] = [];
    if (schema.type === "ref" && schema.refName && names.has(schema.refName)) {
      deps.push(schema.refName);
    }
    if (schema.properties) {
      for (const prop of Object.values(schema.properties)) {
        if (prop.refName && names.has(prop.refName)) deps.push(prop.refName);
        if (prop.items?.type === "ref" && prop.items.refName && names.has(prop.items.refName)) {
          deps.push(prop.items.refName);
        }
      }
    }
    if (schema.items?.type === "ref" && schema.items.refName && names.has(schema.items.refName)) {
      deps.push(schema.items.refName);
    }
    return deps;
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
  if (!schema) return;
  if (schema.type === "ref" && schema.refName) {
    refs.add(schema.refName);
    return;
  }
  if (schema.type === "array" && schema.items) {
    collectSchemaRefs(schema.items, refs);
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
    // Object properties can reference other schemas
    if (schema.properties) {
      for (const prop of Object.values(schema.properties)) {
        if (prop.refName && !all.has(prop.refName)) queue.push(prop.refName);
        if (prop.items?.type === "ref" && prop.items.refName && !all.has(prop.items.refName)) {
          queue.push(prop.items.refName);
        }
      }
    }
    // Array items
    if (schema.items?.type === "ref" && schema.items.refName && !all.has(schema.items.refName)) {
      queue.push(schema.items.refName);
    }
    // Ref alias
    if (schema.type === "ref" && schema.refName && !all.has(schema.refName)) {
      queue.push(schema.refName);
    }
  }
  return all;
}
