/**
 * Code generators for object and enum schema types.
 */

import type { ParsedSchema } from "../parser/types";
import { schemaToInterface } from "./schema-types";
import { satisfiesExpr, schemaToValidation } from "./schema-utils";
import type { GenerateOptions } from "./types";

export function generateObjectSchema(
  lines: string[],
  name: string,
  schema: ParsedSchema,
  options: GenerateOptions,
): void {
  if (options.includeComments && schema.description) {
    lines.push(`/** ${schema.description} */`);
  }

  if (options.generateSchemas && options.validation !== "none") {
    generateObjectWithValidation(lines, name, schema, options);
  } else if (options.generateTypes) {
    lines.push(`export type ${name} = ${schemaToInterface(schema)}`);
    lines.push("");
  }
}

function generateObjectWithValidation(
  lines: string[],
  name: string,
  schema: ParsedSchema,
  options: GenerateOptions,
): void {
  /* Always emit explicit type when generateTypes is on — preserves JSDoc on ref fields */
  if (options.generateTypes) {
    lines.push(`export type ${name} = ${schemaToInterface(schema)}`);
    lines.push("");
    const satisfies = satisfiesExpr(name, options);
    lines.push(`export const ${name}Schema = ${schemaToValidation(schema, options)}${satisfies};`);
  } else {
    lines.push(`export const ${name}Schema = ${schemaToValidation(schema, options)};`);
  }
  lines.push("");
}

export function generateEnumSchema(
  lines: string[],
  name: string,
  schema: ParsedSchema,
  options: GenerateOptions,
): void {
  if (options.includeComments && schema.description) {
    lines.push(`/** ${schema.description} */`);
  }

  const filtered = (schema.enum ?? []).filter((v) => v !== null && v !== undefined);

  if (options.generateSchemas && options.validation === "zod") {
    const values = filtered.map((v) => (typeof v === "string" ? `"${v}"` : v));
    lines.push(`export const ${name}Schema = z.enum([${values.join(", ")}]);`);
    lines.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);
    lines.push("");
  } else if (options.generateSchemas && options.validation === "valibot") {
    const values = filtered.map((val) =>
      typeof val === "string" ? `v.literal("${val}")` : `v.literal(${val})`,
    );
    lines.push(`export const ${name}Schema = v.union([${values.join(", ")}]);`);
    lines.push(`export type ${name} = v.InferOutput<typeof ${name}Schema>;`);
    lines.push("");
  } else if (options.generateSchemas && options.validation === "arktype") {
    const values = filtered.map((val) => (typeof val === "string" ? `"'${val}'"` : `"${val}"`));
    lines.push(`export const ${name}Schema = type(${values.join(" | ")});`);
    lines.push(`export type ${name} = typeof ${name}Schema.infer;`);
    lines.push("");
  } else if (options.generateTypes) {
    const values = filtered.map((val) => (typeof val === "string" ? `"${val}"` : val));
    lines.push(`export type ${name} = ${values.join(" | ")};`);
    lines.push("");
  }
}
