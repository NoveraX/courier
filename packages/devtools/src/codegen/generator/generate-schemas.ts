/**
 * Generates schema/type files for each group.
 */

import type { ParsedSchema } from "../parser/types";
import {
  generateArraySchema,
  generateEnumSchema,
  generateObjectSchema,
  generatePrimitiveSchema,
  generateRefSchema,
} from "./generate-schema-entries";
import { topoSortSchemas } from "./schema-refs";
import { schemaToInterface } from "./schema-types";
import type { GeneratedFile, GenerateOptions } from "./types";

export function generateSchemasFile(
  schemas: Record<string, ParsedSchema>,
  options: GenerateOptions,
  groupName?: string,
): GeneratedFile {
  const lines: string[] = [];

  if (options.validation === "zod") {
    lines.push(`import { z } from "zod";`, "");
  } else if (options.validation === "valibot") {
    lines.push(`import * as v from "valibot";`, "");
  } else if (options.validation === "arktype") {
    lines.push(`import { type } from "arktype";`, "");
  }

  // Topological sort: schemas must be defined before they are referenced
  const sortedEntries = topoSortSchemas(schemas);

  for (const [name, schema] of sortedEntries) {
    if (schema.type === "object" && schema.properties) {
      generateObjectSchema(lines, name, schema, options);
    } else if (schema.type === "enum" && schema.enum) {
      generateEnumSchema(lines, name, schema, options);
    } else if (schema.type === "ref" && schema.refName) {
      generateRefSchema(lines, name, schema, options);
    } else if (schema.type === "array") {
      generateArraySchema(lines, name, schema, options);
    } else if (["string", "number", "integer", "boolean"].includes(schema.type)) {
      generatePrimitiveSchema(lines, name, schema, options);
    }
  }

  return {
    path: groupName
      ? `${options.outputDir}/${groupName}/schemas.ts`
      : `${options.outputDir}/schemas.ts`,
    content: lines.join("\n"),
  };
}

export function generateTypesFile(
  schemas: Record<string, ParsedSchema>,
  options: GenerateOptions,
  groupName?: string,
): GeneratedFile {
  const lines: string[] = [];

  for (const [name, schema] of Object.entries(schemas)) {
    if (options.includeComments && schema.description) {
      lines.push(`/** ${schema.description} */`);
    }

    if (schema.type === "object") {
      lines.push(`export type ${name} = ${schemaToInterface(schema)}`);
      lines.push("");
    } else if (schema.type === "enum" && schema.enum) {
      const filtered = schema.enum.filter((v) => v !== null && v !== undefined);
      const values = filtered.map((v) => (typeof v === "string" ? `"${v}"` : v));
      lines.push(`export type ${name} = ${values.join(" | ")};`);
      lines.push("");
    }
  }

  return {
    path: groupName
      ? `${options.outputDir}/${groupName}/types.ts`
      : `${options.outputDir}/types.ts`,
    content: lines.join("\n"),
  };
}
