/**
 * Schema utility functions: validation helpers, satisfies expressions, ref helpers.
 */

import type { ParsedSchema } from "../parser/types";
import type { GeneratorSettings } from "./types";
import { schemaToArkType } from "./validation-arktype";
import { schemaToValibot } from "./validation-valibot";
import { schemaToZod } from "./validation-zod";

/**
 * The clause holding a schema to its declared type, so the two cannot drift
 * apart: what the schema outputs must be the type.
 *
 * @param typeName - The declared type
 * @param options - Generation options, read for the validation library
 * @returns The clause, with its leading space, or `""` without a validator
 * @example
 * ```ts
 * satisfiesExpr("Pet", { validation: "valibot" }); // " satisfies v.GenericSchema<unknown, Pet>"
 * ```
 */
export function satisfiesExpr(typeName: string, options: GeneratorSettings): string {
  /* Only the output is compared: zod's whole ZodType, compared for each of
     Stripe's 1,865 schemas, took tsc 3.7 GB and 15 s; this takes 0.9 GB and 3 s. */
  if (options.validation === "zod") return ` satisfies { _zod: { output: ${typeName} } }`;
  if (options.validation === "valibot") return ` satisfies v.GenericSchema<unknown, ${typeName}>`;
  if (options.validation === "arktype") return ` satisfies { infer: ${typeName} }`;
  return "";
}

/**
 * Write a schema whose definition refers back to itself.
 *
 * A value cannot read a constant declared below it, so a schema on a
 * reference cycle is wrapped in the validator's `lazy` and given an explicit
 * annotation — without one the compiler cannot infer a type that mentions
 * itself. Stripe's treasury objects need this in both directions. The
 * annotation names the type as what the schema accepts as well as what it
 * produces: left to `unknown` or `any`, the variables of an endpoint taking
 * such a body were typed as nothing but its parameters.
 *
 * @param name - Schema name, without the `Schema` suffix
 * @param body - The validator expression as it would be written eagerly
 * @param typeName - Type the schema produces, when one is being generated
 * @param options - Generation options, read for the validation library
 * @returns The full `export const` line, or `undefined` when the library has
 *   no lazy form and the eager declaration must be used instead
 */
export function lazyDeclaration(
  name: string,
  body: string,
  typeName: string | undefined,
  options: GeneratorSettings,
): string | undefined {
  if (options.validation === "zod") {
    const annotation = typeName ? `z.ZodType<${typeName}, ${typeName}>` : "z.ZodType<unknown>";
    return `export const ${name}Schema: ${annotation} = z.lazy(() => ${body});`;
  }
  if (options.validation === "valibot") {
    const annotation = typeName ? `v.GenericSchema<${typeName}, ${typeName}>` : "v.GenericSchema";
    return `export const ${name}Schema: ${annotation} = v.lazy(() => ${body});`;
  }
  return undefined;
}

export function getSchemaRefName(schema: ParsedSchema | null): string | null {
  if (!schema) return null;
  if (schema.type === "ref") return schema.refName ?? null;
  if (schema.type === "array" && schema.items?.type === "ref") return schema.items.refName ?? null;
  return null;
}

export function schemaToValidation(schema: ParsedSchema, options: GeneratorSettings): string {
  if (options.validation === "zod") return schemaToZod(schema);
  if (options.validation === "valibot") return schemaToValibot(schema);
  if (options.validation === "arktype") return schemaToArkType(schema);
  return "unknown";
}
