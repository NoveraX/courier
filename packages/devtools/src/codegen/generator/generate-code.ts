/**
 * Main code generation orchestrator.
 */

import type { ParsedGroup, ParsedSchema, ParsedSpec } from "../parser/types";
import { generateGroupFile } from "./generate-group";
import { generateIndexFile } from "./generate-index";
import { generateSchemasFile, generateTypesFile } from "./generate-schemas";
import { generateSourceFile } from "./generate-source";
import { collectGroupSchemas } from "./schema-utils";
import type { GeneratedFile, GenerateOptions } from "./types";

export function generateCode(spec: ParsedSpec, options: GenerateOptions): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  // Merge outputDir + sourceName into the effective output path
  const effectiveDir = `${options.outputDir.replace(/\/+$/, "")}/${options.sourceName}`;
  const opts = { ...options, outputDir: effectiveDir };
  const groups = filterGroups(spec.groups, opts);

  // Generate per-group folders (each with index.ts + schemas.ts)
  const hasSchemas = Object.keys(spec.schemas).length > 0;
  /** Maps group name → set of schema names in that group's schemas file */
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

  // Generate source file (defineApi)
  files.push(generateSourceFile(groups, spec, opts));

  // Generate index file (barrel: client + re-exports)
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
