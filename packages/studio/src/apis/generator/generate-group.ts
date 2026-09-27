/**
 * Generates group definition files (defineGroup + endpoints).
 */

import type { ParsedGroup, ParsedSchema, ParsedSpec } from "../parser/types";
import { buildEndpointDefinition } from "./build-endpoint";
import { describesResponseWithSchema, emitsSchemas } from "./build-endpoint-helpers";
import { resolveResponseType } from "./endpoint-types";
import { jsdocText } from "./jsdoc-text";
import { jsLiteral, objectKey } from "./literals";
import { collectSchemaRefs } from "./schema-refs";
import { getSchemaRefName } from "./schema-utils";
import type { GeneratedFile, ResolvedGenerateOptions } from "./types";

export function generateGroupFile(
  group: ParsedGroup,
  spec: ParsedSpec,
  options: ResolvedGenerateOptions,
  extracted?: Record<string, ParsedSchema>,
): GeneratedFile {
  const lines: string[] = [];
  const schemaImports = new Set<string>();

  for (const ep of group.endpoints) {
    collectSchemaRefs(ep.responseSchema, schemaImports);
    collectSchemaRefs(ep.requestBody, schemaImports);
  }

  const typeImports = collectTypeImports(group, spec, options, schemaImports, extracted);
  const needsValidation = checkNeedsValidationImport(group, options, schemaImports);

  lines.push(`import { courier, defineGroup } from "@noverax/courier/define";`);

  if (needsValidation) {
    if (options.validation === "zod") lines.push(`import { z } from "zod";`);
    else if (options.validation === "valibot") lines.push(`import * as v from "valibot";`);
  }

  const importLine = buildImportLine(schemaImports, typeImports, options);
  if (importLine) lines.push(importLine);

  lines.push("");
  lines.push("const { endpoint } = courier();");
  lines.push("");
  lines.push(`export const ${group.name} = defineGroup({`);
  lines.push(`  prefix: ${jsLiteral(group.prefix)},`);
  lines.push(`  endpoints: {`);

  for (const ep of group.endpoints) {
    if (options.includeComments && ep.description) {
      lines.push(`    /** ${jsdocText(ep.description)} */`);
    }
    const def = buildEndpointDefinition(ep, spec, options, schemaImports, extracted);
    lines.push(`    ${objectKey(ep.name)}: ${def},`);
  }

  lines.push(`  },`);
  lines.push(`});`);
  lines.push("");

  return {
    path: options.layout.groupFile(group.name),
    content: lines.join("\n"),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildImportLine(
  schemaImports: Set<string>,
  typeImports: Set<string>,
  options: ResolvedGenerateOptions,
): string | null {
  if (schemaImports.size === 0 && typeImports.size === 0) return null;
  /* Nothing is written into the schemas file unless a validator emits into
     it or types are being generated — importing from it then named a module
     that does not exist. */
  if (!emitsSchemas(options) && !options.generateTypes) return null;

  const schemas = emitsSchemas(options);
  const parts: string[] = [];
  const schemaFile = options.generateSchemas ? "./schemas" : "./types";

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

  if (parts.length === 0) return null;
  return `import { ${parts.join(", ")} } from "${schemaFile}";`;
}

function collectTypeImports(
  group: ParsedGroup,
  spec: ParsedSpec,
  options: ResolvedGenerateOptions,
  schemaImports: Set<string>,
  extracted?: Record<string, ParsedSchema>,
): Set<string> {
  const typeImports = new Set<string>();
  if (!options.generateTypes) return typeImports;

  for (const ep of group.endpoints) {
    if (!describesResponseWithSchema(ep, options, schemaImports)) {
      const responseType = resolveResponseType(ep, spec, options);
      /* A response type may name several schemas — `SimpleUser[] | Stargazer[]`
         — so each one is looked for inside it rather than compared to the
         whole of it. */
      for (const ref of schemaImports) {
        if (namesType(responseType, ref)) typeImports.add(ref);
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

  /* Add extracted params types as type-only imports */
  if (extracted) {
    for (const name of Object.keys(extracted)) {
      if (name.endsWith("Params")) typeImports.add(name);
    }
  }

  return typeImports;
}

function checkNeedsValidationImport(
  group: ParsedGroup,
  options: ResolvedGenerateOptions,
  schemaImports: Set<string>,
): boolean {
  if (!options.generateSchemas || options.validation === "none") return false;

  for (const ep of group.endpoints) {
    const ref = getSchemaRefName(ep.responseSchema);
    if (ep.responseSchema?.type === "array" && ref && schemaImports.has(ref)) return true;
    const bodyRef = getSchemaRefName(ep.requestBody);
    const hasPathParams = ep.parameters.some((p) => p.in === "path");
    if (bodyRef && schemaImports.has(bodyRef) && hasPathParams) return true;
  }
  return false;
}

/** Does this type expression name `ref` as an identifier of its own? */
function namesType(expression: string | null, ref: string): boolean {
  if (!expression) return false;
  return new RegExp(`(^|[^A-Za-z0-9_$])${ref}([^A-Za-z0-9_$]|$)`).test(expression);
}
