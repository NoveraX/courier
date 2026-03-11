/**
 * Main code generation orchestrator.
 */

import type { ParsedGroup, ParsedSchema, ParsedSpec } from "../parser/types";
import { generateFlatSourceFile } from "./generate-flat-source";
import { generateGroupFile } from "./generate-group";
import { generateIndexFile } from "./generate-index";
import { generateSchemasFile, generateTypesFile } from "./generate-schemas";
import { generateSourceFile } from "./generate-source";
import { collectGroupSchemas } from "./schema-refs";
import { transformSpec } from "./transform-spec";
import type { GeneratedFile, GenerateOptions } from "./types";

export function generateCode(spec: ParsedSpec, options: GenerateOptions): GeneratedFile[] {
  const effectiveDir = `${options.outputDir.replace(/\/+$/, "")}/${options.sourceName}`;
  const opts = { ...options, outputDir: effectiveDir };

  /* Filter by selection BEFORE regrouping (selectedEndpoints uses original group names) */
  const filtered = filterGroups(spec.groups, opts);
  const transformed = transformSpec({ ...spec, groups: filtered }, opts);

  if (opts.groupBy === "single") {
    return generateFlat(transformed, opts);
  }

  return generateGrouped(transformed, opts);
}

function generateFlat(spec: ParsedSpec, opts: GenerateOptions): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const allEndpoints = spec.groups.flatMap((g) => g.endpoints);

  /* Collect only schemas referenced by selected endpoints */
  const flatGroup: ParsedGroup = {
    name: "api",
    description: "",
    prefix: "/",
    endpoints: allEndpoints,
  };
  const usedSchemaNames = collectGroupSchemas(flatGroup, spec);

  if (usedSchemaNames.size > 0) {
    const usedSchemas: Record<string, ParsedSchema> = {};
    for (const name of usedSchemaNames) {
      if (spec.schemas[name]) usedSchemas[name] = spec.schemas[name];
    }
    if (opts.generateSchemas) {
      files.push(generateSchemasFile(usedSchemas, opts));
    } else if (opts.generateTypes) {
      files.push(generateTypesFile(usedSchemas, opts));
    }
  }

  files.push(generateFlatSourceFile(allEndpoints, spec, opts));
  files.push(generateIndexFile(spec, [], opts, new Map(), true));

  return files;
}

function generateGrouped(spec: ParsedSpec, opts: GenerateOptions): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const groups = spec.groups;
  const hasSchemas = Object.keys(spec.schemas).length > 0;
  const groupSchemaMap = new Map<string, Set<string>>();

  for (const group of groups) {
    if (hasSchemas && (opts.generateSchemas || opts.generateTypes)) {
      const groupSchemaNames = collectGroupSchemas(group, spec);
      if (groupSchemaNames.size > 0) {
        groupSchemaMap.set(group.name, groupSchemaNames);
        const groupSchemas: Record<string, ParsedSchema> = {};
        for (const name of groupSchemaNames) {
          if (spec.schemas[name]) groupSchemas[name] = spec.schemas[name];
        }
        if (opts.generateSchemas) {
          files.push(generateSchemasFile(groupSchemas, opts, group.name));
        } else {
          files.push(generateTypesFile(groupSchemas, opts, group.name));
        }
      }
    }
    files.push(generateGroupFile(group, spec, opts));
  }

  files.push(generateSourceFile(groups, spec, opts));
  files.push(generateIndexFile(spec, groups, opts, groupSchemaMap));

  return files;
}

// ── Filter by selection ──────────────────────────────────────────────────────

function filterGroups(groups: ParsedGroup[], options: GenerateOptions): ParsedGroup[] {
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
