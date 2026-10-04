/**
 * Write ArkType schemas that refer to each other.
 *
 * ArkType builds a schema the moment it is declared and evaluates a thunk at
 * once, so two schemas cannot name each other directly. Its own answer, a
 * `type.module`, does not scale: build time grows explosively with the number
 * of members — 20 take under a second, 40 take nine, and the 83 that Stripe's
 * core objects form never finished. Instead, a reference within a cycle is a
 * narrow that reads its target only while validating, and each schema on the
 * cycle carries an explicit type, which the compiler needs to type a value
 * that mentions itself.
 */

import { ownValue } from "../own-value";
import type { ParsedSchema } from "../parser/types";
import { jsdocText } from "./jsdoc-text";
import type { GeneratorSettings } from "./types";
import { type LazyTargets, schemaToArkType } from "./validation-arktype";

/**
 * Declarations every file with a cycle starts with.
 *
 * ArkType asks a narrowed branch about literal values while it is still
 * building a type: the branch's own `true`, `false` and `null`, and the
 * literal members of the union around it, to drop those another branch
 * covers. Until the file has finished running, the schema a lazy branch
 * names may not exist yet. Answering no for everything dropped the branch's
 * own booleans for good, so a list of booleans in a JSON value was refused;
 * those literals are kept, and anything else is claimed by no lazy branch
 * until its schema exists.
 */
export const ARKTYPE_CYCLE_HELPER = `/* Set by the last line of this file. */
let declared = false;

/**
 * Refer to a schema on the same reference cycle, read only while validating.
 * The schema is taken as \`unknown\`: typed as a function, the compiler would
 * work out what it returns through the whole cycle, past its depth limit.
 */
function lazy(base: ark.Type, resolve: () => unknown) {
  return base.narrow((value, ctx) => {
    if (!declared) return typeof value === "boolean" || value === null;
    const schema = resolve();
    if (typeof schema !== "function") return false;
    const result: unknown = Reflect.apply(schema, undefined, [value]);
    if (!(result instanceof type.errors)) return true;
    for (const error of result) {
      ctx.reject({ expected: error.expected, actual: error.actual, relativePath: [...error.path] });
    }
    return false;
  });
}
`;

/**
 * How each member of a cycle is named from inside it.
 *
 * @param names - The schemas that refer to each other
 * @param schemas - Every schema in the file, for resolving references
 * @param withTypes - Whether a TypeScript type is written for each schema
 * @returns A lazy target per member
 */
export function lazyTargets(
  names: string[],
  schemas: Record<string, ParsedSchema>,
  withTypes: boolean,
): LazyTargets {
  return new Map(
    names.map((name) => [
      name,
      {
        base:
          [...domains(ownValue(schemas, name), schemas, new Set())].sort().join(" | ") || "unknown",
        typeName: withTypes ? name : undefined,
      },
    ]),
  );
}

/**
 * Write the members of one cycle.
 *
 * @param lines - Output the declarations are appended to
 * @param entries - The schemas that refer to each other
 * @param lazy - How each of them is named from inside the cycle
 * @param options - Generator options
 * @param toInterface - Renders the TypeScript type for a schema
 */
export function writeArkTypeCycle(
  lines: string[],
  entries: [string, ParsedSchema][],
  lazy: LazyTargets,
  options: GeneratorSettings,
  toInterface: (schema: ParsedSchema) => string,
): void {
  for (const [name, schema] of entries) {
    if (options.includeComments && schema.description) {
      lines.push(`/** ${jsdocText(schema.description)} */`);
    }
    if (options.generateTypes) lines.push(`export type ${name} = ${toInterface(schema)}`);
    const annotation = options.generateTypes ? name : "unknown";
    lines.push(
      `export const ${name}Schema: ark.Type<${annotation}> = ${schemaToArkType(schema, lazy)};`,
    );
    lines.push("");
  }
}

/**
 * The kinds of value a schema can hold, as ArkType keywords.
 *
 * Telling ArkType a lazy branch holds only objects lets it keep `null` and
 * other primitives apart from that branch without asking the target.
 */
function domains(
  schema: ParsedSchema | undefined,
  schemas: Record<string, ParsedSchema>,
  seen: Set<string>,
): Set<string> {
  if (!schema) return new Set(["unknown"]);
  if (schema.type === "object" || schema.type === "array") return new Set(["object"]);
  if (schema.type === "enum") {
    return new Set((schema.enum ?? []).map((value) => (value === null ? "null" : typeof value)));
  }
  if (schema.type === "union") {
    const all = new Set<string>();
    for (const variant of schema.variants ?? []) {
      for (const domain of domains(variant, schemas, seen)) all.add(domain);
    }
    return all;
  }
  if (schema.type === "ref" && schema.refName && !seen.has(schema.refName)) {
    seen.add(schema.refName);
    return domains(ownValue(schemas, schema.refName), schemas, seen);
  }
  if (schema.type === "string" || schema.type === "boolean") return new Set([schema.type]);
  if (schema.type === "number" || schema.type === "integer") return new Set(["number"]);
  return new Set(["unknown"]);
}
