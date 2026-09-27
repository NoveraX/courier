/**
 * Main code generation orchestrator.
 */

import { InvalidImportError, resolveImportLayout } from "../layout";
import type { ParsedGroup, ParsedSpec } from "../parser/types";
import { buildSchemaRecord } from "./build-schema-record";
import { extractEndpointTypes } from "./extract-endpoint-types";
import { generateFlatSourceFile } from "./generate-flat-source";
import { generateGroupFile } from "./generate-group";
import { generateIndexFile } from "./generate-index";
import { generateSchemasFile, generateTypesFile } from "./generate-schemas";
import { generateSourceFile } from "./generate-source";
import { transformSpec } from "./transform-spec";
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

  /* Filter by selection BEFORE regrouping (selectedEndpoints uses original group names) */
  const filtered = filterGroups(spec.groups, opts);
  const transformed = transformSpec({ ...spec, groups: filtered }, opts);

  if (opts.groupBy === "single") {
    return generateFlat(transformed, opts);
  }

  return generateGrouped(transformed, opts);
}

function generateFlat(spec: ParsedSpec, opts: ResolvedGenerateOptions): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const flatGroup: ParsedGroup = {
    name: "api",
    description: "",
    prefix: "/",
    endpoints: spec.groups.flatMap((g) => g.endpoints),
  };

  const { group: processed, schemas: extracted } = extractEndpointTypes(flatGroup);
  const groupSchemas = buildSchemaRecord(processed, spec, extracted);

  const schemaMap = new Map<string, Set<string>>();
  if (Object.keys(groupSchemas).length > 0 && (opts.generateSchemas || opts.generateTypes)) {
    const file = opts.generateSchemas
      ? generateSchemasFile(groupSchemas, opts)
      : generateTypesFile(groupSchemas, opts);
    if (file.content.trim() !== "") {
      schemaMap.set("", new Set(Object.keys(groupSchemas)));
      files.push(file);
    }
  }

  files.push(generateFlatSourceFile(processed.endpoints, spec, opts, extracted));
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

    if (Object.keys(groupSchemas).length > 0 && (opts.generateSchemas || opts.generateTypes)) {
      const file = opts.generateSchemas
        ? generateSchemasFile(groupSchemas, opts, group.name)
        : generateTypesFile(groupSchemas, opts, group.name);

      /* With both a validator and types turned off there is nothing to
         declare. Writing the file anyway left an empty module the barrel
         then re-exported, which TypeScript rejects. */
      if (file.content.trim() !== "") {
        groupSchemaMap.set(group.name, new Set(Object.keys(groupSchemas)));
        files.push(file);
      }
    }

    files.push(generateGroupFile(processed, spec, opts, extracted));
  }

  files.push(generateSourceFile(spec.groups, spec, opts));
  files.push(generateIndexFile(spec, spec.groups, opts, groupSchemaMap));

  return files;
}

// ── Filter by selection ──────────────────────────────────────────────────────

function filterGroups(groups: ParsedGroup[], options: ResolvedGenerateOptions): ParsedGroup[] {
  if (!options.selectedEndpoints) return groups;

  return groups
    .map((group) => {
      const selected = options.selectedEndpoints?.[group.name];
      if (!selected) return null;

      return {
        ...group,
        endpoints: group.endpoints.filter((e) => selected.includes(e.name)),
      };
    })
    .filter((g): g is ParsedGroup => g !== null && g.endpoints.length > 0);
}
