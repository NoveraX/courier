/**
 * Per-schema-type code generators (object, enum, ref, array, primitive).
 */

import type { ParsedSchema } from "../parser/types";
import { schemaToInterface } from "./schema-types";
import { satisfiesExpr, schemaToValidation } from "./schema-utils";
import type { GenerateOptions } from "./types";
import { primitiveToArkType } from "./validation-arktype";
import { primitiveToValibot } from "./validation-valibot";
import { primitiveToZod } from "./validation-zod";

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
    // Check if any property has a description — if so, generate explicit type for JSDoc
    const hasPropertyDocs =
      options.includeComments &&
      options.generateTypes &&
      schema.properties &&
      Object.values(schema.properties).some((p) => p.description);

    if (hasPropertyDocs) {
      // Type first, then schema with `satisfies` — single source of truth for structure
      lines.push(`export type ${name} = ${schemaToInterface(schema)}`);
      lines.push("");
      const satisfies = satisfiesExpr(name, options);
      lines.push(
        `export const ${name}Schema = ${schemaToValidation(schema, options)}${satisfies};`,
      );
    } else {
      lines.push(`export const ${name}Schema = ${schemaToValidation(schema, options)};`);
    }
    lines.push("");

    if (options.generateTypes && !hasPropertyDocs) {
      if (options.validation === "zod") {
        lines.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);
      } else if (options.validation === "valibot") {
        lines.push(`export type ${name} = v.InferOutput<typeof ${name}Schema>;`);
      } else if (options.validation === "arktype") {
        lines.push(`export type ${name} = typeof ${name}Schema.infer;`);
      }
      lines.push("");
    }
  } else if (options.generateTypes) {
    lines.push(`export type ${name} = ${schemaToInterface(schema)}`);
    lines.push("");
  }
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

export function generateRefSchema(
  lines: string[],
  name: string,
  schema: ParsedSchema,
  options: GenerateOptions,
): void {
  if (options.includeComments && schema.description) {
    lines.push(`/** ${schema.description} */`);
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
    lines.push(`/** ${schema.description} */`);
  }
  if (options.generateSchemas && options.validation !== "none") {
    lines.push(`export const ${name}Schema = ${schemaToValidation(schema, options)};`);
    if (options.generateTypes) {
      if (options.validation === "zod") {
        lines.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);
      } else if (options.validation === "valibot") {
        lines.push(`export type ${name} = v.InferOutput<typeof ${name}Schema>;`);
      } else if (options.validation === "arktype") {
        lines.push(`export type ${name} = typeof ${name}Schema.infer;`);
      }
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
    lines.push(`/** ${schema.description} */`);
  }
  const tsTypeName = schema.type === "integer" ? "number" : schema.type;
  if (options.generateSchemas && options.validation !== "none") {
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
    lines.push("");
  } else if (options.generateTypes) {
    lines.push(`export type ${name} = ${tsTypeName};`);
    lines.push("");
  }
}
