/**
 * Main code generation orchestrator.
 */

import { InvalidImportError, resolveImportLayout } from "../layout";
import type { ParsedGroup, ParsedSchema, ParsedSpec } from "../parser/types";
import { buildSchemaRecord } from "./build-schema-record";
import { SINGLE_GROUP } from "./endpoint-placements";
import { extractEndpointTypes } from "./extract-endpoint-types";
import { generateFlatSourceFile } from "./generate-flat-source";
import { generateGroupFile } from "./generate-group";
import { generateIndexFile } from "./generate-index";
import { generateSchemasFile, generateTypesFile } from "./generate-schemas";
import { generateSourceFile } from "./generate-source";
import { selectedEndpoints, transformSpec } from "./transform-spec";
import type { GeneratedFile, GenerateOptions, ResolvedGenerateOptions } from "./types";
import { applyImportDefaults } from "./types";

/**
 * Generate an import's files from a parsed spec, at the paths its layout
 * gives them.
 *
 * @param spec - The parsed spec
 * @param options - The import's declaration and, transiently, the endpoints picked
 * @param importName - The import's key under `imports`; `options.sourceName` when omitted, as the import wizard names both alike
 * @returns The files, each with its project-relative path
 * @throws {InvalidImportError} When the output directory or a name is refused
 * @example
 * ```ts
 * const files = generateCode(spec, { type: "openapi", outputDir: "src/api" }, "petStore");
 * ```
 */
export function generateCode(
  spec: ParsedSpec,
  options: GenerateOptions,
  importName: string | undefined = options.sourceName,
): GeneratedFile[] {
  if (importName === undefined) {
    throw new InvalidImportError("importName", "", "the import has no name");
  }
  const opts = applyImportDefaults(options, resolveImportLayout(options, importName));

  /* A selection names endpoints by the specification's own groups. */
  const selected = selectedEndpoints(spec.groups, opts.selectedEndpoints);
  const transformed = transformSpec(spec, opts, selected);

  if (opts.groupBy === "single") {
    return generateFlat(transformed, opts);
  }

  return generateGrouped(transformed, opts);
}

function generateFlat(spec: ParsedSpec, opts: ResolvedGenerateOptions): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const flatGroup: ParsedGroup = {
    name: SINGLE_GROUP,
    description: "",
    prefix: "/",
    endpoints: spec.groups.flatMap((g) => g.endpoints),
  };

  const { group: processed, schemas: extracted } = extractEndpointTypes(flatGroup);
  const groupSchemas = buildSchemaRecord(processed, spec, extracted);

  const schemaMap = new Map<string, Set<string>>();
  const schemasFile = schemaFileFor(groupSchemas, opts);
  if (schemasFile) {
    schemaMap.set("", new Set(Object.keys(groupSchemas)));
    files.push(schemasFile);
  }

  const declared = schemasFile ? groupSchemas : {};
  files.push(generateFlatSourceFile(processed.endpoints, spec, opts, declared, extracted));
  /* The barrel re-exports the schemas file only when one was written. */
  files.push(generateIndexFile(spec, [], opts, schemaMap, true));

  return files;
}

function generateGrouped(spec: ParsedSpec, opts: ResolvedGenerateOptions): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const groupSchemaMap = new Map<string, Set<string>>();

  for (const group of spec.groups) {
    const { group: processed, schemas: extracted } = extractEndpointTypes(group);
    const groupSchemas = buildSchemaRecord(processed, spec, extracted);

    const schemasFile = schemaFileFor(groupSchemas, opts, group.name);
    if (schemasFile) {
      groupSchemaMap.set(group.name, new Set(Object.keys(groupSchemas)));
      files.push(schemasFile);
    }

    const declared = schemasFile ? groupSchemas : {};
    files.push(generateGroupFile(processed, spec, opts, declared, extracted));
  }

  files.push(generateSourceFile(spec.groups, spec, opts));
  files.push(generateIndexFile(spec, spec.groups, opts, groupSchemaMap));

  return files;
}

/**
 * The schemas or types file declaring a group's schemas, when there is
 * anything to declare.
 *
 * With both a validator and types turned off there is nothing to declare.
 * Writing the file anyway left an empty module the barrel then re-exported,
 * which TypeScript rejects.
 */
function schemaFileFor(
  schemas: Record<string, ParsedSchema>,
  opts: ResolvedGenerateOptions,
  groupName?: string,
): GeneratedFile | null {
  if (Object.keys(schemas).length === 0 || !(opts.generateSchemas || opts.generateTypes)) {
    return null;
  }
  const file = opts.generateSchemas
    ? generateSchemasFile(schemas, opts, groupName)
    : generateTypesFile(schemas, opts, groupName);
  return file.content.trim() === "" ? null : file;
}
