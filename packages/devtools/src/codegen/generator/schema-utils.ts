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
