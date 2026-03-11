/**
 * Generates group definition files (defineGroup + endpoints).
 */

import type { ParsedGroup, ParsedSpec } from "../parser/types";
import { buildEndpointDefinition } from "./build-endpoint";
import { collectSchemaRefs } from "./schema-refs";
import { resolveResponseType } from "./schema-types";
import { getSchemaRefName } from "./schema-utils";
import type { GeneratedFile, GenerateOptions } from "./types";

export function generateGroupFile(
  group: ParsedGroup,
  spec: ParsedSpec,
  options: GenerateOptions,
): GeneratedFile {
  const lines: string[] = [];
  const imports = new Set<string>();
  const schemaImports = new Set<string>();

  imports.add("defineGroup");
  imports.add("endpoint");

  // Collect schema refs used by this group
  for (const ep of group.endpoints) {
    collectSchemaRefs(ep.responseSchema, schemaImports);
    collectSchemaRefs(ep.requestBody, schemaImports);
  }

  // Track which types are actually used in endpoint generics (not just as schema configs)
  const typeImports = collectTypeImports(group, spec, options, schemaImports);

  // Check if any endpoint needs validation lib import in group file
  const needsValidationImport = checkNeedsValidationImport(group, options, schemaImports);

  // Core import
  lines.push(`import { ${[...imports].join(", ")} } from "@noverax/nexus/define";`);

  // Validation lib import (only if needed for array wrappers in endpoint configs)
  if (needsValidationImport) {
    if (options.validation === "zod") lines.push(`import { z } from "zod";`);
    else if (options.validation === "valibot") lines.push(`import * as v from "valibot";`);
  }

  // Schema/type imports — only import types that are actually used in generics
  if (schemaImports.size > 0 && (options.generateSchemas || options.generateTypes)) {
    const schemaFile = options.generateSchemas ? "./schemas" : "./types";
    const importNames = [...schemaImports].map((name) =>
      options.generateSchemas ? `${name}Schema` : name,
    );
    if (options.generateTypes && options.generateSchemas && typeImports.size > 0) {
      const typeNames = [...typeImports].map((name) => `type ${name}`);
      importNames.push(...typeNames);
    }
    lines.push(`import { ${importNames.join(", ")} } from "${schemaFile}";`);
  }

  lines.push("");

  // defineGroup
  lines.push(`export const ${group.name} = defineGroup({`);
  lines.push(`  prefix: "${group.prefix}",`);
  lines.push(`  endpoints: {`);

  for (const ep of group.endpoints) {
    if (options.includeComments && ep.description) {
      lines.push(`    /** ${ep.description} */`);
    }

    const endpointDef = buildEndpointDefinition(ep, spec, options, schemaImports);
    lines.push(`    ${ep.name}: ${endpointDef},`);
  }

  lines.push(`  },`);
  lines.push(`});`);
  lines.push("");

  return {
    path: `${options.outputDir}/${group.name}/index.ts`,
    content: lines.join("\n"),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function collectTypeImports(
  group: ParsedGroup,
  spec: ParsedSpec,
  options: GenerateOptions,
  schemaImports: Set<string>,
): Set<string> {
  const typeImports = new Set<string>();
  if (!options.generateTypes || !options.generateSchemas) return typeImports;

  for (const ep of group.endpoints) {
    const responseType = resolveResponseType(ep, spec, options);
    for (const ref of schemaImports) {
      if (responseType === ref || responseType === `${ref}[]`) {
        typeImports.add(ref);
      }
    }
    if (options.includeComments) {
      const bodyRef = getSchemaRefName(ep.requestBody);
      if (bodyRef && schemaImports.has(bodyRef)) {
        const bodySchema = spec.schemas[bodyRef];
        if (
          bodySchema?.properties &&
          Object.values(bodySchema.properties).some((p) => p.description)
        ) {
          typeImports.add(bodyRef);
        }
      }
    }
  }
  return typeImports;
}

function checkNeedsValidationImport(
  group: ParsedGroup,
  options: GenerateOptions,
  schemaImports: Set<string>,
): boolean {
  if (!options.generateSchemas || options.validation === "none") return false;

  for (const ep of group.endpoints) {
    const ref = getSchemaRefName(ep.responseSchema);
    if (ep.responseSchema?.type === "array" && ref && schemaImports.has(ref)) {
      return true;
    }
    const bodyRef = getSchemaRefName(ep.requestBody);
    const hasPathParams = ep.parameters.some((p) => p.in === "path");
    if (bodyRef && schemaImports.has(bodyRef) && hasPathParams) {
      return true;
    }
  }
  return false;
}
