import type { ParsedSchema } from "../parser/types";
import { emitsSchemas } from "./build-endpoint-helpers";
import { callsOwnFields } from "./calls-own-fields";
import { type EndpointContext, hasSchemaConstant, schemaConstant } from "./endpoint-context";
import { collectRefsDeep } from "./schema-refs";
import { getSchemaRefName, schemaToValidation } from "./schema-utils";

/**
 * The schema of a body or an answer: a named schema's constant, or — written
 * inline — the schema of what is not an object with fields, a string, a
 * list, a map, so a body or an answer of one is validated and a mock can make
 * one up. An inline object with fields has a type of its own instead.
 *
 * @param schema - The body's or the answer's schema
 * @param context - The file it is written into, which records what it uses
 * @returns The schema's source, or `null` when there is none to write
 * @example
 * ```ts
 * declaredSchema(listPets.responseSchema, context); // "z.array(PetSchema)"
 * ```
 */
export function declaredSchema(
  schema: ParsedSchema | null,
  context: EndpointContext,
): string | null {
  const ref = getSchemaRefName(schema);
  if (ref) {
    const constant = schemaConstant(context, ref);
    return constant ? listOf(constant, schema, context) : null;
  }
  if (!emitsSchemas(context.options) || !schema || hasFields(schema)) return null;
  if (!namesDeclared(schema, context)) return null;
  context.uses.validator = true;
  const written = schemaToValidation(schema, context.options);
  /* An object inside it whose fields include a name every object inherits is written through `_ownFields`. */
  if (callsOwnFields(`(${written});`)) context.uses.ownFields = true;
  return written;
}

/* An object with fields; a map, which has none, is written as a record. */
function hasFields(schema: ParsedSchema): boolean {
  return schema.type === "object" && Object.keys(schema.properties ?? {}).length > 0;
}

function namesDeclared(schema: ParsedSchema, context: EndpointContext): boolean {
  return constantsDeclared([schema], context);
}

/**
 * Whether the file can import a constant for every named schema the given
 * ones refer to, at any depth — recording each as used when it can.
 *
 * @param schemas - The schemas whose references the code written names
 * @param context - The file being written
 * @returns Whether every one is declared beside the file
 * @example
 * ```ts
 * constantsDeclared([created.schema], context); // → true, and `RangeSchema` is imported
 * ```
 */
export function constantsDeclared(
  schemas: readonly (ParsedSchema | null | undefined)[],
  context: EndpointContext,
): boolean {
  const names = new Set<string>();
  for (const schema of schemas) collectRefsDeep(schema, names);
  if (![...names].every((name) => hasSchemaConstant(context, name))) return false;
  for (const name of names) schemaConstant(context, name);
  return true;
}

/**
 * The validator for a named schema, wrapped when the payload is a list.
 *
 * A request body that is an array was expressed as the schema of one element,
 * so the validator rejected the very payload the endpoint requires.
 */
function listOf(constant: string, schema: ParsedSchema | null, context: EndpointContext): string {
  if (schema?.type !== "array") return constant;
  const { validation } = context.options;
  if (validation === "arktype") return `${constant}.array()`;
  context.uses.validator = true;
  return validation === "zod" ? `z.array(${constant})` : `v.array(${constant})`;
}
