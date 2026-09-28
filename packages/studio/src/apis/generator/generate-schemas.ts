/**
 * Generates schema/type files for each group.
 */

import { ownValue } from "../own-value";
import type { ParsedSchema } from "../parser/types";
import { ARKTYPE_CYCLE_HELPER, lazyTargets, writeArkTypeCycle } from "./arktype-cycles";
import { findCyclicSchemas } from "./cyclic-schemas";
import { generateCyclicSchema } from "./generate-cyclic-schema";
import {
  generateArraySchema,
  generateEnumSchema,
  generateObjectSchema,
  generatePrimitiveSchema,
  generateRefSchema,
  generateUnionSchema,
} from "./generate-schema-entries";
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
    const entries = names.flatMap((name): [string, ParsedSchema][] => {
      const schema = ownValue(schemas, name);
      return schema === undefined ? [] : [[name, schema]];
    });
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

/**
 * Write the file of types a group's endpoints import when no validator
 * schemas are asked for.
 *
 * Every schema is declared, as `validation: "none"` declares them in a
 * schemas file. Writing objects and enums alone left a union, a list, a
 * primitive or an alias undeclared while the endpoints still imported it.
 *
 * @param schemas - The schemas the group names, by name
 * @param options - The import's resolved options
 * @param groupName - The group, or none for an import generated flat
 * @returns The types file, at the path the layout gives it
 * @example
 * ```ts
 * generateTypesFile({ Pet: petUnion }, options, "pets").content; // "export type Pet = Cat | Dog;\n…"
 * ```
 */
export function generateTypesFile(
  schemas: Record<string, ParsedSchema>,
  options: ResolvedGenerateOptions,
  groupName?: string,
): GeneratedFile {
  const lines: string[] = [];
  writeEntries(lines, topoSortSchemas(schemas), { ...options, generateSchemas: false }, new Set());

  return {
    path: groupName
      ? options.layout.groupSchemaFile(groupName, "types")
      : options.layout.schemaFile("types"),
    content: lines.join("\n"),
  };
}
