/**
 * Generates schema/type files for each group.
 */

import { ownValue } from "../own-value";
import type { ParsedSchema } from "../parser/types";
import { ARKTYPE_CYCLE_HELPER, lazyTargets, writeArkTypeCycle } from "./arktype-cycles";
import { findCyclicSchemas } from "./cyclic-schemas";
import { type DeclaredKind, declaredInLines } from "./declared-in-lines";
import { generateCyclicSchema } from "./generate-cyclic-schema";
import {
  generateArraySchema,
  generateEnumSchema,
  generateObjectSchema,
  generatePrimitiveSchema,
  generateRefSchema,
  generateUnionSchema,
} from "./generate-schema-entries";
import { holdsOwnFields } from "./holds-own-fields";
import { ownFieldsHelper } from "./own-fields-helper";
import { schemaComponents } from "./schema-components";
import { topoSortSchemas } from "./schema-refs";
import { schemaToInterface } from "./schema-types";
import { schemasValidatorImport } from "./schemas-validator-import";
import type { GeneratedFile, GeneratorSettings, ResolvedGenerateOptions } from "./types";

/** A schemas or types module the generator wrote, and the names it exports. */
export interface SchemaModule {
  file: GeneratedFile;
  /** Each name the module exports, in the order it declares them: a value, or only a type. */
  declares: ReadonlyMap<string, DeclaredKind>;
}

export function generateSchemasFile(
  schemas: Record<string, ParsedSchema>,
  options: ResolvedGenerateOptions,
  groupName?: string,
): SchemaModule {
  const body: string[] = [];
  /* An object whose fields include a name every object inherits is written through `_ownFields`. */
  const helper = holdsOwnFields(Object.values(schemas))
    ? ownFieldsHelper(options.validation)
    : null;
  let cycle = false;
  if (options.validation === "arktype") {
    cycle = writeArkTypeFile(body, schemas, options, helper);
  } else {
    if (helper !== null) body.push(helper);
    /* A cycle cannot be sorted so every reference points backwards; its
       members are written lazily instead. */
    writeEntries(body, topoSortSchemas(schemas), options, findCyclicSchemas(schemas));
  }
  /* ArkType's types before its named import, as linters order them; the library only when called. */
  const imports = [
    ...(cycle ? [`import type * as ark from "arktype";`] : []),
    ...schemasValidatorImport(options.validation, body),
  ];
  const lines = imports.length > 0 ? [...imports, "", ...body] : body;

  return {
    file: {
      path: groupName
        ? options.layout.groupSchemaFile(groupName, "schemas")
        : options.layout.schemaFile("schemas"),
      content: lines.join("\n"),
    },
    declares: declaredInLines(lines),
  };
}

/**
 * ArkType builds each schema as it is declared, so schemas are written in an
 * order where every reference points backwards — except within a cycle, whose
 * members name each other lazily. Whether one is, which its types import.
 */
function writeArkTypeFile(
  lines: string[],
  schemas: Record<string, ParsedSchema>,
  options: GeneratorSettings,
  helper: string | null,
): boolean {
  const components = schemaComponents(schemas);
  const hasCycle = components.some((component) => component.cyclic);
  if (hasCycle) lines.push(ARKTYPE_CYCLE_HELPER);
  if (helper !== null) lines.push(helper);

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
  return hasCycle;
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
 * @returns The types file, at the path the layout gives it, and the names it exports
 * @example
 * ```ts
 * generateTypesFile({ Pet: petUnion }, options, "pets").file.content; // "export type Pet = Cat | Dog;\n…"
 * ```
 */
export function generateTypesFile(
  schemas: Record<string, ParsedSchema>,
  options: ResolvedGenerateOptions,
  groupName?: string,
): SchemaModule {
  const lines: string[] = [];
  writeEntries(lines, topoSortSchemas(schemas), { ...options, generateSchemas: false }, new Set());

  return {
    file: {
      path: groupName
        ? options.layout.groupSchemaFile(groupName, "types")
        : options.layout.schemaFile("types"),
      content: lines.join("\n"),
    },
    declares: declaredInLines(lines),
  };
}
