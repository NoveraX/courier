/**
 * Code generators for ref, array, and primitive schema types.
 */

import type { ParsedSchema } from "../parser/types";
import { schemaToTsType } from "./inline-types";
import { jsdocText } from "./jsdoc-text";
import { typeStyleFor } from "./schema-types";
import { schemaToValidation } from "./schema-utils";
import type { GeneratorSettings } from "./types";
import { primitiveToArkType } from "./validation-arktype";
import { primitiveToValibot } from "./validation-valibot";
import { primitiveToZod } from "./validation-zod";

export function generateRefSchema(
  lines: string[],
  name: string,
  schema: ParsedSchema,
  options: GeneratorSettings,
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
  options: GeneratorSettings,
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
    /* The element's whole type: naming only a referenced element typed a
       list of strings `unknown[]`. */
    lines.push(`export type ${name} = ${schemaToTsType(schema, typeStyleFor(options))};`);
    lines.push("");
  }
}

export function generatePrimitiveSchema(
  lines: string[],
  name: string,
  schema: ParsedSchema,
  options: GeneratorSettings,
): void {
  if (options.includeComments && schema.description) {
    lines.push(`/** ${jsdocText(schema.description)} */`);
  }
  /* A definition that says only what it means — Kubernetes writes two of them
     — carries no type at all. It still has to be declared: other schemas name
     it, and a name nothing declares does not compile. */
  const tsTypeName =
    schema.type === "integer" ? "number" : schema.type === "any" ? "unknown" : schema.type;
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
  options: GeneratorSettings,
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

function appendInferredType(lines: string[], name: string, options: GeneratorSettings): void {
  if (options.validation === "zod") {
    lines.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);
  } else if (options.validation === "valibot") {
    lines.push(`export type ${name} = v.InferOutput<typeof ${name}Schema>;`);
  } else if (options.validation === "arktype") {
    lines.push(`export type ${name} = typeof ${name}Schema.infer;`);
  }
}
