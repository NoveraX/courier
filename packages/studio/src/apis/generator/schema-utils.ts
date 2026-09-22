/**
 * Schema utility functions: validation helpers, satisfies expressions, ref helpers.
 */

import type { ParsedSchema } from "../parser/types";
import type { GenerateOptions } from "./types";
import { schemaToArkType } from "./validation-arktype";
import { schemaToValibot } from "./validation-valibot";
import { schemaToZod } from "./validation-zod";

/** Generate `satisfies ZodType<T>` / `satisfies GenericSchema<...>` expression for type-safe sync */
export function satisfiesExpr(typeName: string, options: GenerateOptions): string {
  if (options.validation === "zod") return ` satisfies z.ZodType<${typeName}>`;
  if (options.validation === "valibot") return ` satisfies v.GenericSchema<any, ${typeName}>`;
  if (options.validation === "arktype") return ` satisfies { infer: ${typeName} }`;
  return "";
}

/**
 * Write a schema whose definition refers back to itself.
 *
 * A value cannot read a constant declared below it, so a schema on a
 * reference cycle is wrapped in the validator's `lazy` and given an explicit
 * annotation — without one the compiler cannot infer a type that mentions
 * itself. Stripe's treasury objects need this in both directions.
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
  options: GenerateOptions,
): string | undefined {
  if (options.validation === "zod") {
    const annotation = typeName ? `z.ZodType<${typeName}>` : "z.ZodType<unknown>";
    return `export const ${name}Schema: ${annotation} = z.lazy(() => ${body});`;
  }
  if (options.validation === "valibot") {
    const annotation = typeName ? `v.GenericSchema<any, ${typeName}>` : "v.GenericSchema";
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

export function schemaToValidation(schema: ParsedSchema, options: GenerateOptions): string {
  if (options.validation === "zod") return schemaToZod(schema);
  if (options.validation === "valibot") return schemaToValibot(schema);
  if (options.validation === "arktype") return schemaToArkType(schema);
  return "unknown";
}

/** Extend a schema expression with path param fields */
export function extendSchemaWithParams(
  schemaExpr: string,
  paramNames: string[],
  options: GenerateOptions,
): string {
  if (paramNames.length === 0) return schemaExpr;

  if (options.validation === "zod") {
    const fields = paramNames.map((n) => `${n}: z.string()`).join(", ");
    return `${schemaExpr}.extend({ ${fields} })`;
  }
  if (options.validation === "valibot") {
    const fields = paramNames.map((n) => `${n}: v.string()`).join(", ");
    return `v.object({ ...${schemaExpr}.entries, ${fields} })`;
  }
  if (options.validation === "arktype") {
    const fields = paramNames.map((n) => `${n}: "string"`).join(", ");
    return `${schemaExpr}.and({ ${fields} })`;
  }

  return schemaExpr;
}
