/**
 * Generates schema/type files for each group.
 */

import type { ParsedSchema } from "../parser/types";
import { ARKTYPE_CYCLE_HELPER, lazyTargets, writeArkTypeCycle } from "./arktype-cycles";
import { findCyclicSchemas } from "./cyclic-schemas";
import { typeUnion } from "./enum-literals";
import { generateCyclicSchema } from "./generate-cyclic-schema";
import {
  generateArraySchema,
  generateEnumSchema,
  generateObjectSchema,
  generatePrimitiveSchema,
  generateRefSchema,
  generateUnionSchema,
} from "./generate-schema-entries";
import { jsdocText } from "./jsdoc-text";
import { schemaComponents } from "./schema-components";
import { topoSortSchemas } from "./schema-refs";
import { schemaToInterface } from "./schema-types";
import type { GeneratedFile, GeneratorSettings, ResolvedGenerateOptions } from "./types";

export function generateSchemasFile(
  schemas: Record<string, ParsedSchema>,
  options: ResolvedGenerateOptions,
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

  if (options.validation === "arktype") {
    writeArkTypeFile(lines, schemas, options);
  } else {
    /* A cycle cannot be sorted so every reference points backwards; its
       members are written lazily instead. */
    writeEntries(lines, topoSortSchemas(schemas), options, findCyclicSchemas(schemas));
  }

  return {
    path: groupName
      ? options.layout.groupSchemaFile(groupName, "schemas")
      : options.layout.schemaFile("schemas"),
    content: lines.join("\n"),
  };
}

/**
 * ArkType builds each schema as it is declared, so schemas are written in an
 * order where every reference points backwards — except within a cycle, whose
 * members name each other lazily.
 */
function writeArkTypeFile(
  lines: string[],
  schemas: Record<string, ParsedSchema>,
  options: GeneratorSettings,
): void {
  const components = schemaComponents(schemas);
  const hasCycle = components.some((component) => component.cyclic);
  if (hasCycle) lines.splice(1, 0, `import type * as ark from "arktype";`);
  if (hasCycle) lines.push(ARKTYPE_CYCLE_HELPER);

  for (const { names, cyclic } of components) {
    const entries = names.map((name): [string, ParsedSchema] => [
      name,
      schemas[name] as ParsedSchema,
    ]);
    if (!cyclic) {
      writeEntries(lines, entries, options, new Set());
      continue;
    }
    const lazy = lazyTargets(names, schemas, options.generateTypes === true);
    writeArkTypeCycle(lines, entries, lazy, options, schemaToInterface);
  }

  if (hasCycle) lines.push("declared = true;", "");
}

/** Write one declaration per schema, in the order given. */
function writeEntries(
  lines: string[],
  entries: [string, ParsedSchema][],
  options: GeneratorSettings,
  cyclic: Set<string>,
): void {
  const deferrable = options.generateSchemas && options.validation !== "none";
  for (const [name, schema] of entries) {
    if (deferrable && cyclic.has(name)) {
      generateCyclicSchema(lines, name, schema, options);
    } else if (schema.type === "object" && schema.properties) {
      generateObjectSchema(lines, name, schema, options);
    } else if (schema.type === "enum" && schema.enum) {
      generateEnumSchema(lines, name, schema, options);
    } else if (schema.type === "ref" && schema.refName) {
      generateRefSchema(lines, name, schema, options);
    } else if (schema.type === "union" && schema.variants?.length) {
      generateUnionSchema(lines, name, schema, options);
    } else if (schema.type === "array") {
      generateArraySchema(lines, name, schema, options);
    } else {
      /* Anything left — including a schema with no type of its own — still
         gets a declaration, because the schemas that reference it will name
         it either way. */
      generatePrimitiveSchema(lines, name, schema, options);
    }
  }
}

export function generateTypesFile(
  schemas: Record<string, ParsedSchema>,
  options: ResolvedGenerateOptions,
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
      ? options.layout.groupSchemaFile(groupName, "types")
      : options.layout.schemaFile("types"),
    content: lines.join("\n"),
  };
}
