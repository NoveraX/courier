/**
 * Generates a flat source file with endpoints directly in defineApi.
 * Used when groupBy === "single".
 */

import type { ParsedEndpoint, ParsedSchema, ParsedSpec } from "../parser/types";
import { buildEndpointDefinition } from "./build-endpoint";
import { describesResponseWithSchema, emitsSchemas } from "./build-endpoint-helpers";
import { jsdocText } from "./jsdoc-text";
import { collectSchemaRefs } from "./schema-refs";
import { resolveResponseType } from "./schema-types";
import { getSchemaRefName } from "./schema-utils";
import type { GeneratedFile, ResolvedGenerateOptions } from "./types";

export function generateFlatSourceFile(
  endpoints: ParsedEndpoint[],
  spec: ParsedSpec,
  options: ResolvedGenerateOptions,
  extracted?: Record<string, ParsedSchema>,
): GeneratedFile {
  const lines: string[] = [];
  const schemaImports = new Set<string>();

  for (const ep of endpoints) {
    collectSchemaRefs(ep.responseSchema, schemaImports);
    collectSchemaRefs(ep.requestBody, schemaImports);
  }

  const typeImports = collectTypeImports(endpoints, spec, options, schemaImports, extracted);
  const needsValidation = checkNeedsValidation(endpoints, options, schemaImports);

  lines.push(`import { courier, defineApi } from "@noverax/courier/define";`);

  if (needsValidation) {
    if (options.validation === "zod") lines.push(`import { z } from "zod";`);
    else if (options.validation === "valibot") lines.push(`import * as v from "valibot";`);
  }

  if (
    (schemaImports.size > 0 || typeImports.size > 0) &&
    (options.generateSchemas || options.generateTypes)
  ) {
    const schemas = emitsSchemas(options);
    const schemaFile = options.generateSchemas ? "./schemas" : "./types";
    const parts: string[] = [];
    for (const name of schemaImports) {
      parts.push(schemas ? `${name}Schema` : name);
    }
    for (const name of typeImports) {
      if (schemas) {
        parts.push(`type ${name}`);
      } else if (!schemaImports.has(name)) {
        parts.push(name);
      }
    }
    if (parts.length > 0) lines.push(`import { ${parts.join(", ")} } from "${schemaFile}";`);
  }

  lines.push("");
  lines.push("const { endpoint } = courier();");
  lines.push("");
  lines.push(`export const ${options.sourceName} = defineApi({`);
  lines.push(`  baseURL: "${spec.baseURL}",`);
  lines.push(`  endpoints: {`);

  for (const ep of endpoints) {
    if (options.includeComments && ep.description) {
      lines.push(`    /** ${jsdocText(ep.description)} */`);
    }
    const def = buildEndpointDefinition(ep, spec, options, schemaImports, extracted);
    lines.push(`    ${ep.name}: ${def},`);
  }

  lines.push(`  },`);
  lines.push(`});`);
  lines.push("");

  return {
    path: `${options.outputDir}/source.ts`,
    content: lines.join("\n"),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function collectTypeImports(
  endpoints: ParsedEndpoint[],
  spec: ParsedSpec,
  options: ResolvedGenerateOptions,
  schemaImports: Set<string>,
  extracted?: Record<string, ParsedSchema>,
): Set<string> {
  const typeImports = new Set<string>();
  if (!options.generateTypes) return typeImports;

  for (const ep of endpoints) {
    if (!describesResponseWithSchema(ep, options, schemaImports)) {
      const responseType = resolveResponseType(ep, spec, options);
      for (const ref of schemaImports) {
        if (responseType === ref || responseType === `${ref}[]`) {
          typeImports.add(ref);
        }
      }
    }
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

  if (extracted) {
    for (const name of Object.keys(extracted)) {
      if (name.endsWith("Params")) typeImports.add(name);
    }
  }

  return typeImports;
}

function checkNeedsValidation(
  endpoints: ParsedEndpoint[],
  options: ResolvedGenerateOptions,
  schemaImports: Set<string>,
): boolean {
  if (!options.generateSchemas || options.validation === "none") return false;

  for (const ep of endpoints) {
    const ref = getSchemaRefName(ep.responseSchema);
    if (ep.responseSchema?.type === "array" && ref && schemaImports.has(ref)) return true;
    const bodyRef = getSchemaRefName(ep.requestBody);
    const hasPathParams = ep.parameters.some((p) => p.in === "path");
    if (bodyRef && schemaImports.has(bodyRef) && hasPathParams) return true;
  }
  return false;
}
