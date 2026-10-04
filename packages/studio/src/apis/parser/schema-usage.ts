import { ownValue } from "../own-value";
import { schemaTraits } from "./schema-traits";
import type { ParsedSchema, ParsedSpec } from "./types";

/** Which named schemas the requests send and which the answers carry. */
export interface SchemaUsage {
  /** Reached from a request body or a parameter, references followed. */
  sent: Set<string>;
  /** Reached from an answer, references followed. */
  answered: Set<string>;
}

/**
 * Find the named schemas each direction reaches: those a request sends —
 * in its body or a parameter — and those an answer carries, following every
 * reference from there.
 *
 * @param spec - The parsed specification
 * @returns The schemas sent and the schemas answered, by name
 * @example
 * ```ts
 * const { sent, answered } = schemaUsage(spec);
 * sent.has("User") && answered.has("User"); // → true for a schema both create and read
 * ```
 */
export function schemaUsage(spec: ParsedSpec): SchemaUsage {
  const requests: ParsedSchema[] = [];
  const answers: ParsedSchema[] = [];
  for (const ep of spec.groups.flatMap((group) => group.endpoints)) {
    if (ep.requestBody) requests.push(ep.requestBody);
    for (const param of ep.parameters) {
      for (const part of [param.schema, param.items]) if (part) requests.push(part);
    }
    if (ep.responseSchema) answers.push(ep.responseSchema);
  }
  return { sent: reachable(requests, spec.schemas), answered: reachable(answers, spec.schemas) };
}

function reachable(
  roots: readonly ParsedSchema[],
  schemas: Readonly<Record<string, ParsedSchema>>,
): Set<string> {
  const found = new Set<string>();
  const queue = roots.flatMap((root) => [...schemaTraits(root).refs]);
  for (let name = queue.pop(); name !== undefined; name = queue.pop()) {
    if (found.has(name)) continue;
    found.add(name);
    const schema = ownValue(schemas, name);
    if (schema) queue.push(...schemaTraits(schema).refs);
  }
  return found;
}
