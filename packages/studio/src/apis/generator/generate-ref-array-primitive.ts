/**
 * Code generators for ref, array, and primitive schema types.
 */

import type { ParsedSchema } from "../parser/types";
import { jsdocText } from "./jsdoc-text";
import { schemaToValidation } from "./schema-utils";
import type { GenerateOptions } from "./types";
import { primitiveToArkType } from "./validation-arktype";
import { primitiveToValibot } from "./validation-valibot";
import { primitiveToZod } from "./validation-zod";

export function generateRefSchema(
  lines: string[],
  name: string,
  schema: ParsedSchema,
  options: GenerateOptions,
): void {
  if (options.includeComments && schema.description) {
    lines.push(`/** ${jsdocText(schema.description)} */`);
  }
  if (options.generateSchemas && options.validation !== "none") {
    lines.push(`export const ${name}Schema = ${schema.refName}Schema;`);
    if (options.generateTypes) {
      lines.push(`export type ${name} = ${schema.refName};`);
    }
    lines.push("");
  } else if (options.generateTypes) {
    lines.push(`export type ${name} = ${schema.refName};`);
    lines.push("");
  }
}

export function generateArraySchema(
  lines: string[],
  name: string,
  schema: ParsedSchema,
  options: GenerateOptions,
): void {
  if (options.includeComments && schema.description) {
    lines.push(`/** ${jsdocText(schema.description)} */`);
  }
  if (options.generateSchemas && options.validation !== "none") {
    lines.push(`export const ${name}Schema = ${schemaToValidation(schema, options)};`);
    if (options.generateTypes) {
      appendInferredType(lines, name, options);
    }
    lines.push("");
  } else if (options.generateTypes) {
    const itemType = schema.items?.refName ?? "unknown";
    lines.push(`export type ${name} = ${itemType}[];`);
    lines.push("");
  }
}

export function generatePrimitiveSchema(
  lines: string[],
  name: string,
  schema: ParsedSchema,
  options: GenerateOptions,
): void {
  if (options.includeComments && schema.description) {
    lines.push(`/** ${jsdocText(schema.description)} */`);
  }
  const tsTypeName = schema.type === "integer" ? "number" : schema.type;
  if (options.generateSchemas && options.validation !== "none") {
    appendPrimitiveValidation(lines, name, schema, options);
    lines.push("");
  } else if (options.generateTypes) {
    lines.push(`export type ${name} = ${tsTypeName};`);
    lines.push("");
  }
}

function appendPrimitiveValidation(
  lines: string[],
  name: string,
  schema: ParsedSchema,
  options: GenerateOptions,
): void {
  if (options.validation === "zod") {
    lines.push(`export const ${name}Schema = ${primitiveToZod(schema.type)};`);
    lines.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);
  } else if (options.validation === "valibot") {
    lines.push(`export const ${name}Schema = ${primitiveToValibot(schema.type)};`);
    lines.push(`export type ${name} = v.InferOutput<typeof ${name}Schema>;`);
  } else if (options.validation === "arktype") {
    lines.push(`export const ${name}Schema = type(${primitiveToArkType(schema.type)});`);
    lines.push(`export type ${name} = typeof ${name}Schema.infer;`);
  }
}

function appendInferredType(lines: string[], name: string, options: GenerateOptions): void {
  if (options.validation === "zod") {
    lines.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);
  } else if (options.validation === "valibot") {
    lines.push(`export type ${name} = v.InferOutput<typeof ${name}Schema>;`);
  } else if (options.validation === "arktype") {
    lines.push(`export type ${name} = typeof ${name}Schema.infer;`);
  }
}
