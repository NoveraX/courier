/**
 * Generates schema/type files for each group.
 */

import type { ParsedSchema } from "../parser/types";
import { findCyclicSchemas } from "./cyclic-schemas";
import { typeUnion } from "./enum-literals";
import {
  generateArraySchema,
  generateEnumSchema,
  generateObjectSchema,
  generatePrimitiveSchema,
  generateRefSchema,
} from "./generate-schema-entries";
import { jsdocText } from "./jsdoc-text";
import { topoSortSchemas } from "./schema-refs";
import { schemaToInterface } from "./schema-types";
import type { GeneratedFile, GenerateOptions } from "./types";
import { schemaToArkType } from "./validation-arktype";

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
  /* A cycle cannot be sorted that way, so its members are written lazily. */
  const cyclic = findCyclicSchemas(schemas);

  /* ArkType cannot read a constant that is declared later and evaluates a
     thunk immediately, so schemas that refer to each other are declared
     together in one module and re-exported from it. */
  const inModule =
    options.validation === "arktype" && cyclic.size > 0
      ? emitArkTypeModule(lines, sortedEntries, options)
      : new Set<string>();

  for (const [name, schema] of sortedEntries) {
    if (inModule.has(name)) continue;
    if (schema.type === "object" && schema.properties) {
      generateObjectSchema(lines, name, schema, options, cyclic.has(name));
    } else if (schema.type === "enum" && schema.enum) {
      generateEnumSchema(lines, name, schema, options);
    } else if (schema.type === "ref" && schema.refName) {
      generateRefSchema(lines, name, schema, options);
    } else if (schema.type === "array") {
      generateArraySchema(lines, name, schema, options);
    } else {
      /* Anything left — including a schema with no type of its own — still
         gets a declaration, because the schemas that reference it will name
         it either way. */
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

/**
 * Declare every schema on a reference cycle inside one ArkType module.
 *
 * @returns The names that were declared here and must not be declared again
 */
function emitArkTypeModule(
  lines: string[],
  entries: [string, ParsedSchema][],
  options: GenerateOptions,
): Set<string> {
  /* A schema outside the module cannot be named from inside it, and one
     inside cannot be read from outside before the module exists — so once any
     cycle is present the whole file is declared as one module. */
  const members = entries;
  if (members.length === 0) return new Set();

  lines.push("const cyclic = type.module({");
  for (const [name, schema] of members) {
    lines.push(`  ${name}: ${schemaToArkType(schema, "member")},`);
  }
  lines.push("});");
  lines.push("");

  for (const [name, schema] of members) {
    if (options.generateTypes) {
      lines.push(`export type ${name} = ${schemaToInterface(schema)}`);
    }
    lines.push(`export const ${name}Schema = cyclic.${name};`);
    lines.push("");
  }
  return new Set(members.map(([name]) => name));
}

export function generateTypesFile(
  schemas: Record<string, ParsedSchema>,
  options: GenerateOptions,
  groupName?: string,
): GeneratedFile {
  const lines: string[] = [];

  for (const [name, schema] of Object.entries(schemas)) {
    if (options.includeComments && schema.description) {
      lines.push(`/** ${jsdocText(schema.description)} */`);
    }

    if (schema.type === "object") {
      lines.push(`export type ${name} = ${schemaToInterface(schema)}`);
      lines.push("");
    } else if (schema.type === "enum" && schema.enum) {
      lines.push(`export type ${name} = ${typeUnion(schema.enum)};`);
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
