/**
 * Main code generation orchestrator.
 */

import type { ParsedGroup, ParsedSchema, ParsedSpec } from "../parser/types";
import { extractEndpointTypes } from "./extract-endpoint-types";
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
  const flatGroup: ParsedGroup = {
    name: "api",
    description: "",
    prefix: "/",
    endpoints: spec.groups.flatMap((g) => g.endpoints),
  };

  const { group: processed, schemas: extracted } = extractEndpointTypes(flatGroup);
  const groupSchemas = buildSchemaRecord(processed, spec, extracted);

  if (Object.keys(groupSchemas).length > 0 && (opts.generateSchemas || opts.generateTypes)) {
    if (opts.generateSchemas) {
      files.push(generateSchemasFile(groupSchemas, opts));
    } else {
      files.push(generateTypesFile(groupSchemas, opts));
    }
  }

  files.push(generateFlatSourceFile(processed.endpoints, spec, opts, extracted));
  files.push(generateIndexFile(spec, [], opts, new Map(), true));

  return files;
}

function generateGrouped(spec: ParsedSpec, opts: GenerateOptions): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const groupSchemaMap = new Map<string, Set<string>>();

  for (const group of spec.groups) {
    const { group: processed, schemas: extracted } = extractEndpointTypes(group);
    const groupSchemas = buildSchemaRecord(processed, spec, extracted);

    if (Object.keys(groupSchemas).length > 0 && (opts.generateSchemas || opts.generateTypes)) {
      groupSchemaMap.set(group.name, new Set(Object.keys(groupSchemas)));
      if (opts.generateSchemas) {
        files.push(generateSchemasFile(groupSchemas, opts, group.name));
      } else {
        files.push(generateTypesFile(groupSchemas, opts, group.name));
      }
    }

    files.push(generateGroupFile(processed, spec, opts, extracted));
  }

  files.push(generateSourceFile(spec.groups, spec, opts));
  files.push(generateIndexFile(spec, spec.groups, opts, groupSchemaMap));

  return files;
}

/** Collect spec schemas + extracted endpoint types, including transitive deps */
function buildSchemaRecord(
  group: ParsedGroup,
  spec: ParsedSpec,
  extracted: Record<string, ParsedSchema>,
): Record<string, ParsedSchema> {
  /* Use extended spec so BFS can resolve deps from extracted schemas */
  const extendedSpec = { ...spec, schemas: { ...spec.schemas, ...extracted } };
  const names = collectGroupSchemas(group, extendedSpec);

  /* Ensure all extracted types are included + collect their transitive deps */
  for (const [name, schema] of Object.entries(extracted)) {
    names.add(name);
    collectDeepRefs(schema, spec, names);
  }

  const result: Record<string, ParsedSchema> = {};
  for (const name of names) {
    if (spec.schemas[name]) result[name] = spec.schemas[name];
    else if (extracted[name]) result[name] = extracted[name];
  }
  return result;
}

/** Recursively collect schema refs from properties */
function collectDeepRefs(schema: ParsedSchema, spec: ParsedSpec, refs: Set<string>): void {
  if (!schema.properties) return;
  for (const prop of Object.values(schema.properties)) {
    const refSchema = prop.refName ? spec.schemas[prop.refName] : undefined;
    if (prop.refName && refSchema && !refs.has(prop.refName)) {
      refs.add(prop.refName);
      collectDeepRefs(refSchema, spec, refs);
    }
    const itemRef = prop.items?.type === "ref" ? prop.items.refName : undefined;
    const itemSchema = itemRef ? spec.schemas[itemRef] : undefined;
    if (itemRef && itemSchema && !refs.has(itemRef)) {
      refs.add(itemRef);
      collectDeepRefs(itemSchema, spec, refs);
    }
  }
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
