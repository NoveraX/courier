/**
 * Code generators for object and enum schema types.
 */

import type { ParsedSchema } from "../parser/types";
import { typeUnion, zodEnum } from "./enum-literals";
import { jsdocText } from "./jsdoc-text";
import { schemaToInterface } from "./schema-types";
import { lazyDeclaration, satisfiesExpr, schemaToValidation } from "./schema-utils";
import type { GenerateOptions } from "./types";
import { schemaToArkType } from "./validation-arktype";
import { valibotEnum } from "./validation-valibot";

export function generateObjectSchema(
  lines: string[],
  name: string,
  schema: ParsedSchema,
  options: GenerateOptions,
  refersToItself = false,
): void {
  if (options.includeComments && schema.description) {
    lines.push(`/** ${jsdocText(schema.description)} */`);
  }

  if (options.generateSchemas && options.validation !== "none") {
    generateObjectWithValidation(lines, name, schema, options, refersToItself);
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
  refersToItself: boolean,
): void {
  /* Always emit explicit type when generateTypes is on — preserves JSDoc on ref fields */
  const typeName = options.generateTypes ? name : undefined;
  if (typeName) {
    lines.push(`export type ${name} = ${schemaToInterface(schema)}`);
    lines.push("");
  }

  const body = schemaToValidation(schema, options);
  const lazy = refersToItself ? lazyDeclaration(name, body, typeName, options) : undefined;
  if (lazy) {
    lines.push(lazy);
  } else if (typeName) {
    lines.push(`export const ${name}Schema = ${body}${satisfiesExpr(name, options)};`);
  } else {
    lines.push(`export const ${name}Schema = ${body};`);
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
    lines.push(`/** ${jsdocText(schema.description)} */`);
  }

  const filtered = (schema.enum ?? []).filter((v) => v !== null && v !== undefined);

  if (options.generateSchemas && options.validation === "zod") {
    lines.push(`export const ${name}Schema = ${zodEnum(filtered)};`);
    lines.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);
    lines.push("");
  } else if (options.generateSchemas && options.validation === "valibot") {
    lines.push(`export const ${name}Schema = ${valibotEnum(filtered)};`);
    lines.push(`export type ${name} = v.InferOutput<typeof ${name}Schema>;`);
    lines.push("");
  } else if (options.generateSchemas && options.validation === "arktype") {
    lines.push(
      `export const ${name}Schema = ${schemaToArkType({ ...schema, type: "enum", enum: filtered })};`,
    );
    lines.push(`export type ${name} = typeof ${name}Schema.infer;`);
    lines.push("");
  } else if (options.generateTypes) {
    lines.push(`export type ${name} = ${typeUnion(filtered)};`);
    lines.push("");
  }
}
