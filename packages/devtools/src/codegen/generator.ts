/**
 * Code generator — takes ParsedSpec and produces Nexus-compatible TypeScript code.
 * Generates: defineApi, defineGroup, endpoint, Zod/Valibot schemas, TS types.
 */

import type {
  ParsedEndpoint,
  ParsedGroup,
  ParsedSchema,
  ParsedSchemaProperty,
  ParsedSecurityScheme,
  ParsedSpec,
} from "./parser";

// ── Options ──────────────────────────────────────────────────────────────────

export interface GenerateOptions {
  /** Source name for the defineApi call */
  sourceName: string;
  /** Output directory (for file paths) */
  outputDir: string;
  /** Validation library */
  validation: "zod" | "valibot" | "arktype" | "none";
  /** Grouping strategy */
  groupBy: "tag" | "path" | "single";
  /** Naming convention */
  naming: "camelCase" | "as-is";
  /** Generate TypeScript types */
  generateTypes: boolean;
  /** Generate validation schemas */
  generateSchemas: boolean;
  /** Add auth middleware to secured endpoints */
  addAuthMiddleware: boolean;
  /** Include JSDoc from descriptions */
  includeComments: boolean;
  /** Generate client file with createCaller/createProxyCaller */
  generateClient: "direct" | "proxy" | "both" | "none";
  /** Selected endpoints — map of groupName → Set<endpointName>, null = all */
  selectedEndpoints: Record<string, string[]> | null;
}

export const DEFAULT_OPTIONS: GenerateOptions = {
  sourceName: "api",
  outputDir: "src/api",
  validation: "zod",
  groupBy: "tag",
  naming: "camelCase",
  generateTypes: true,
  generateSchemas: true,
  addAuthMiddleware: true,
  includeComments: true,
  generateClient: "direct",
  selectedEndpoints: null,
};

/** Derive a camelCase source name from the spec title and/or baseURL. */
export function deriveSourceName(title: string, baseURL?: string): string {
  // Try title first: strip noise words and non-Latin chars
  const cleaned = title
    .replace(/\b(api|service|platform|cloud|public|private|rest|restful|v\d+(\.\d+)*)\b/gi, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim();

  if (cleaned) {
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length > 0) {
      const parts = words.slice(0, 2);
      const result = parts
        .map((w, i) => {
          const lower = w.toLowerCase();
          return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join("");
      if (result) return result;
    }
  }

  // Fallback: extract domain name from baseURL (e.g. "https://api.timeweb.cloud/..." → "timeweb")
  if (baseURL) {
    try {
      const hostname = new URL(baseURL).hostname; // "api.timeweb.cloud"
      const parts = hostname.split(".");
      // Skip "api" prefix and TLD, take the main domain
      const meaningful = parts.filter(
        (p) => !["api", "www", "com", "org", "net", "io", "dev", "cloud", "app"].includes(p),
      );
      if (meaningful.length > 0 && meaningful[0]) {
        return meaningful[0].toLowerCase();
      }
    } catch {
      // not a valid URL, try as path
    }
  }

  return "api";
}

// ── Generated file ───────────────────────────────────────────────────────────

export interface GeneratedFile {
  /** Relative file path, e.g. "src/api/users.ts" */
  path: string;
  /** File content */
  content: string;
}

// ── Main generator ───────────────────────────────────────────────────────────

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

// ── Schema / Types file ──────────────────────────────────────────────────────

function generateSchemasFile(
  schemas: Record<string, ParsedSchema>,
  options: GenerateOptions,
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

  // Topological sort: schemas must be defined before they are referenced
  const sortedEntries = topoSortSchemas(schemas);

  for (const [name, schema] of sortedEntries) {
    if (schema.type === "object" && schema.properties) {
      if (options.includeComments && schema.description) {
        lines.push(`/** ${schema.description} */`);
      }

      if (options.generateSchemas && options.validation !== "none") {
        // Check if any property has a description — if so, generate explicit type for JSDoc
        const hasPropertyDocs =
          options.includeComments &&
          options.generateTypes &&
          schema.properties &&
          Object.values(schema.properties).some((p) => p.description);

        if (hasPropertyDocs) {
          // Type first, then schema with `satisfies` — single source of truth for structure
          lines.push(`export type ${name} = ${schemaToInterface(schema)}`);
          lines.push("");
          const satisfies = satisfiesExpr(name, options);
          lines.push(
            `export const ${name}Schema = ${schemaToValidation(schema, options)}${satisfies};`,
          );
        } else {
          lines.push(`export const ${name}Schema = ${schemaToValidation(schema, options)};`);
        }
        lines.push("");

        if (options.generateTypes && !hasPropertyDocs) {
          if (options.validation === "zod") {
            lines.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);
          } else if (options.validation === "valibot") {
            lines.push(`export type ${name} = v.InferOutput<typeof ${name}Schema>;`);
          } else if (options.validation === "arktype") {
            lines.push(`export type ${name} = typeof ${name}Schema.infer;`);
          }
          lines.push("");
        }
      } else if (options.generateTypes) {
        lines.push(`export type ${name} = ${schemaToInterface(schema)}`);
        lines.push("");
      }
    } else if (schema.type === "enum" && schema.enum) {
      const filtered = schema.enum.filter((v) => v !== null && v !== undefined);
      if (options.generateSchemas && options.validation === "zod") {
        const values = filtered.map((v) => (typeof v === "string" ? `"${v}"` : v));
        lines.push(`export const ${name}Schema = z.enum([${values.join(", ")}]);`);
        lines.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);
        lines.push("");
      } else if (options.generateSchemas && options.validation === "valibot") {
        const values = filtered.map((val) =>
          typeof val === "string" ? `v.literal("${val}")` : `v.literal(${val})`,
        );
        lines.push(`export const ${name}Schema = v.union([${values.join(", ")}]);`);
        lines.push(`export type ${name} = v.InferOutput<typeof ${name}Schema>;`);
        lines.push("");
      } else if (options.generateSchemas && options.validation === "arktype") {
        const values = filtered.map((val) => (typeof val === "string" ? `"'${val}'"` : `"${val}"`));
        lines.push(`export const ${name}Schema = type(${values.join(" | ")});`);
        lines.push(`export type ${name} = typeof ${name}Schema.infer;`);
        lines.push("");
      } else if (options.generateTypes) {
        const values = filtered.map((val) => (typeof val === "string" ? `"${val}"` : val));
        lines.push(`export type ${name} = ${values.join(" | ")};`);
        lines.push("");
      }
    } else if (schema.type === "ref" && schema.refName) {
      // Schema alias — re-export as alias to referenced schema
      if (options.includeComments && schema.description) {
        lines.push(`/** ${schema.description} */`);
      }
      if (options.generateSchemas && options.validation !== "none") {
        lines.push(`export const ${name}Schema = ${schema.refName}Schema;`);
        if (options.generateTypes) {
          lines.push(`export type ${name} = ${schema.refName};`);
        }
        lines.push("");
      } else if (options.generateTypes) {
        lines.push(`export type ${name} = ${schema.refName};`);
        lines.push("");
      }
    } else if (schema.type === "array") {
      // Array schema
      if (options.includeComments && schema.description) {
        lines.push(`/** ${schema.description} */`);
      }
      if (options.generateSchemas && options.validation !== "none") {
        lines.push(`export const ${name}Schema = ${schemaToValidation(schema, options)};`);
        if (options.generateTypes) {
          if (options.validation === "zod") {
            lines.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);
          } else if (options.validation === "valibot") {
            lines.push(`export type ${name} = v.InferOutput<typeof ${name}Schema>;`);
          } else if (options.validation === "arktype") {
            lines.push(`export type ${name} = typeof ${name}Schema.infer;`);
          }
        }
        lines.push("");
      } else if (options.generateTypes) {
        const itemType = schema.items?.refName ?? "unknown";
        lines.push(`export type ${name} = ${itemType}[];`);
        lines.push("");
      }
    } else if (["string", "number", "integer", "boolean"].includes(schema.type)) {
      // Simple type schema
      if (options.includeComments && schema.description) {
        lines.push(`/** ${schema.description} */`);
      }
      const tsTypeName = schema.type === "integer" ? "number" : schema.type;
      if (options.generateSchemas && options.validation !== "none") {
        if (options.validation === "zod") {
          lines.push(`export const ${name}Schema = ${primitiveToZod(schema.type)};`);
          lines.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);
        } else if (options.validation === "valibot") {
          lines.push(`export const ${name}Schema = ${primitiveToValibot(schema.type)};`);
          lines.push(`export type ${name} = v.InferOutput<typeof ${name}Schema>;`);
        } else if (options.validation === "arktype") {
          lines.push(`export const ${name}Schema = type(${primitiveToArkType(schema.type)});`);
          lines.push(`export type ${name} = typeof ${name}Schema.infer;`);
        }
        lines.push("");
      } else if (options.generateTypes) {
        lines.push(`export type ${name} = ${tsTypeName};`);
        lines.push("");
      }
    }
  }

  return {
    path: groupName
      ? `${options.outputDir}/${groupName}/schemas.ts`
      : `${options.outputDir}/schemas.ts`,
    content: lines.join("\n"),
  };
}

function generateTypesFile(
  schemas: Record<string, ParsedSchema>,
  options: GenerateOptions,
  groupName?: string,
): GeneratedFile {
  const lines: string[] = [];

  for (const [name, schema] of Object.entries(schemas)) {
    if (options.includeComments && schema.description) {
      lines.push(`/** ${schema.description} */`);
    }

    if (schema.type === "object") {
      lines.push(`export type ${name} = ${schemaToInterface(schema)}`);
      lines.push("");
    } else if (schema.type === "enum" && schema.enum) {
      const filtered = schema.enum.filter((v) => v !== null && v !== undefined);
      const values = filtered.map((v) => (typeof v === "string" ? `"${v}"` : v));
      lines.push(`export type ${name} = ${values.join(" | ")};`);
      lines.push("");
    }
  }

  return {
    path: groupName
      ? `${options.outputDir}/${groupName}/types.ts`
      : `${options.outputDir}/types.ts`,
    content: lines.join("\n"),
  };
}

// ── Group file ───────────────────────────────────────────────────────────────

function generateGroupFile(
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
  const typeImports = new Set<string>();
  if (options.generateTypes && options.generateSchemas) {
    for (const ep of group.endpoints) {
      const responseType = resolveResponseType(ep, spec, options);
      // If response type references a schema name, it's used as a type
      for (const ref of schemaImports) {
        if (responseType === ref || responseType === `${ref}[]`) {
          typeImports.add(ref);
        }
      }
      // If body schema has properties with descriptions, we generate an explicit interface
      // that's used as a generic — need to import it as a type
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
  }

  // Check if any endpoint needs validation lib import in group file
  // (array response wrappers or schema extension with path params)
  let needsValidationImport = false;
  if (options.generateSchemas && options.validation !== "none") {
    for (const ep of group.endpoints) {
      const ref = getSchemaRefName(ep.responseSchema);
      if (ep.responseSchema?.type === "array" && ref && schemaImports.has(ref)) {
        needsValidationImport = true;
        break;
      }
      // Schema extension with path params requires validation lib
      const bodyRef = getSchemaRefName(ep.requestBody);
      const hasPathParams = ep.parameters.some((p) => p.in === "path");
      if (bodyRef && schemaImports.has(bodyRef) && hasPathParams) {
        needsValidationImport = true;
        break;
      }
    }
  }

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

// ── Source file (defineApi) ───────────────────────────────────────────────────

function generateSourceFile(
  groups: ParsedGroup[],
  spec: ParsedSpec,
  options: GenerateOptions,
): GeneratedFile {
  const lines: string[] = [];

  lines.push(`import { defineApi } from "@noverax/nexus/define";`);

  for (const group of groups) {
    lines.push(`import { ${group.name} } from "./${group.name}";`);
  }

  lines.push("");
  lines.push(`export const ${options.sourceName} = defineApi({`);
  lines.push(`  baseURL: "${spec.baseURL}",`);

  // Generate auth headers from security schemes
  if (options.addAuthMiddleware && spec.securitySchemes.length > 0) {
    const authHeaders = generateAuthHeaders(spec.securitySchemes, options.sourceName);
    if (authHeaders.length > 0) {
      lines.push(`  headers: {`);
      for (const header of authHeaders) {
        lines.push(`    ${header},`);
      }
      lines.push(`  },`);
    }
  }

  lines.push(`  groups: {`);
  for (const group of groups) {
    if (options.includeComments && group.description) {
      lines.push(`    /** ${group.description} */`);
    }
    lines.push(`    ${group.name},`);
  }
  lines.push(`  },`);
  lines.push(`});`);
  lines.push("");

  return {
    path: `${options.outputDir}/source.ts`,
    content: lines.join("\n"),
  };
}

// ── Index file (barrel: client + re-exports) ─────────────────────────────

function generateIndexFile(
  spec: ParsedSpec,
  groups: ParsedGroup[],
  options: GenerateOptions,
  groupSchemaMap?: Map<string, Set<string>>,
): GeneratedFile {
  const lines: string[] = [];
  const name = options.sourceName;
  const hasDirect =
    options.generateClient !== "none" &&
    (options.generateClient === "direct" || options.generateClient === "both");
  const hasProxy = options.generateClient === "proxy" || options.generateClient === "both";

  // Imports
  const nexusImports: string[] = [];
  if (hasDirect) nexusImports.push("createCaller");
  if (hasProxy) nexusImports.push("createProxyCaller");

  if (nexusImports.length > 0) {
    lines.push(`import { ${nexusImports.join(", ")} } from "@noverax/nexus";`);
  }
  lines.push(`import { ${name} } from "./source";`);
  lines.push("");

  // Extract first meaningful paragraph from description (skip markdown headers)
  const shortDescription = extractFirstParagraph(spec.description) || spec.title;

  // Build JSDoc block
  const buildJsDoc = (mode: string, modeHint: string) => {
    const jsDocLines: string[] = [];
    jsDocLines.push("/**");
    jsDocLines.push(` * \`${mode}\` — ${spec.title} v${spec.version}`);
    jsDocLines.push(` *`);
    jsDocLines.push(` * ${modeHint}`);
    if (shortDescription) {
      jsDocLines.push(` *`);
      jsDocLines.push(` * ---`);
      jsDocLines.push(` *`);
      jsDocLines.push(` * ${shortDescription}`);
    }
    jsDocLines.push(" */");
    return jsDocLines;
  };

  // PascalCase source name for variable: timeweb → timewebApi
  const varDirect = `${name}Api`;
  const varProxy = `${name}ProxyApi`;

  // Direct mode
  if (hasDirect) {
    for (const line of buildJsDoc(
      "DIRECT",
      "Calls the API directly from the runtime environment (browser, Node.js, Deno, Bun).",
    )) {
      lines.push(line);
    }
    lines.push(`export const ${varDirect} = createCaller(${name});`);
    lines.push("");
  }

  // Proxy mode
  if (hasProxy) {
    for (const line of buildJsDoc(
      "PROXY",
      "Routes requests through a server-side proxy endpoint. Hides secrets, bypasses CORS, forwards cookies.",
    )) {
      lines.push(line);
    }
    lines.push(`export const ${varProxy} = createProxyCaller<typeof ${name}>("${name}");`);
    lines.push("");
  }

  // Re-export schemas/types from each group folder, skipping groups without schemas
  // and deduplicating shared schema names to avoid TS2308
  if (groupSchemaMap && groupSchemaMap.size > 0) {
    const file = options.generateSchemas ? "schemas" : "types";
    const exported = new Set<string>();

    for (const group of groups) {
      const schemaNames = groupSchemaMap.get(group.name);
      if (!schemaNames) continue;

      // Find which names from this group are unique (not yet exported)
      const unique = [...schemaNames].filter((n) => !exported.has(n));
      if (unique.length === 0) continue;

      // If ALL names are unique, use `export *`
      if (unique.length === schemaNames.size) {
        lines.push(`export * from "./${group.name}/${file}";`);
      } else {
        // Selective re-export to avoid duplicates
        const imports: string[] = [];
        for (const n of unique) {
          if (options.generateSchemas) imports.push(`${n}Schema`);
          if (options.generateTypes) imports.push(`type ${n}`);
        }
        if (imports.length > 0) {
          lines.push(`export { ${imports.join(", ")} } from "./${group.name}/${file}";`);
        }
      }

      for (const n of schemaNames) exported.add(n);
    }
  }
  lines.push("");

  return {
    path: `${options.outputDir}/index.ts`,
    content: lines.join("\n"),
  };
}

/** Extract first meaningful paragraph from a description, skipping markdown headers. */
function extractFirstParagraph(description: string): string {
  if (!description) return "";

  const lines = description.split(/\n+/);
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and markdown headers
    if (!trimmed || trimmed.startsWith("#")) continue;
    // Found first content paragraph — truncate if too long
    if (trimmed.length > 200) {
      return `${trimmed.slice(0, 200)}...`;
    }
    return trimmed;
  }
  return "";
}

// ── Auth headers ─────────────────────────────────────────────────────────

function generateAuthHeaders(schemes: ParsedSecurityScheme[], sourceName: string): string[] {
  const envPrefix = sourceName.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
  const headers: string[] = [];

  for (const scheme of schemes) {
    switch (scheme.type) {
      case "bearer":
        headers.push(`Authorization: \`Bearer \${process.env.${envPrefix}_TOKEN}\``);
        break;
      case "basic":
        headers.push(`Authorization: \`Basic \${process.env.${envPrefix}_CREDENTIALS}\``);
        break;
      case "apiKey":
        if (scheme.in === "header" && scheme.paramName) {
          headers.push(`"${scheme.paramName}": process.env.${envPrefix}_API_KEY ?? ""`);
        }
        break;
      case "oauth2":
        headers.push(`Authorization: \`Bearer \${process.env.${envPrefix}_ACCESS_TOKEN}\``);
        break;
    }
    // Only use the first auth scheme
    break;
  }

  return headers;
}

// ── Endpoint definition builder ──────────────────────────────────────────────

function buildEndpointDefinition(
  ep: ParsedEndpoint,
  spec: ParsedSpec,
  options: GenerateOptions,
  schemaImports: Set<string>,
): string {
  const hasSchema = options.generateSchemas && options.validation !== "none";
  const responseRef = getSchemaRefName(ep.responseSchema);
  const bodyRef = getSchemaRefName(ep.requestBody);

  // Determine if we need schema config
  const schemaConfig: string[] = [];
  if (hasSchema && responseRef && schemaImports.has(responseRef)) {
    let schemaExpr = `${responseRef}Schema`;
    if (ep.responseSchema?.type === "array") {
      if (options.validation === "zod") schemaExpr = `z.array(${responseRef}Schema)`;
      else if (options.validation === "valibot") schemaExpr = `v.array(${responseRef}Schema)`;
      else if (options.validation === "arktype") schemaExpr = `${responseRef}Schema.array()`;
    }
    schemaConfig.push(`response: ${schemaExpr}`);
  }

  // Build variables schema — merge body schema with path params when both exist
  const pathParams = ep.parameters.filter((p) => p.in === "path");
  if (hasSchema && bodyRef && schemaImports.has(bodyRef)) {
    if (pathParams.length > 0) {
      // Extend body schema with path params
      const varsExpr = extendSchemaWithParams(
        `${bodyRef}Schema`,
        pathParams.map((p) => p.name),
        options,
      );
      schemaConfig.push(`variables: ${varsExpr}`);
    } else {
      schemaConfig.push(`variables: ${bodyRef}Schema`);
    }
  }

  // Type annotation for endpoint type
  const typeConfig: string[] = [];
  if (ep.httpMethod === "get") {
    typeConfig.push(`type: "query"`);
  }

  // Resolve explicit types for generics
  const responseType = resolveResponseType(ep, spec, options);
  const varsType = resolveVariablesType(ep, spec, options);

  // Check if body schema has an explicit interface (properties with descriptions)
  // — if so, we need to add the type generic for JSDoc to work in IDE
  let bodyInterfaceType: string | null = null;
  if (
    hasSchema &&
    bodyRef &&
    schemaImports.has(bodyRef) &&
    options.includeComments &&
    options.generateTypes
  ) {
    const bodySchema = spec.schemas[bodyRef];
    if (bodySchema?.properties && Object.values(bodySchema.properties).some((p) => p.description)) {
      bodyInterfaceType = bodyRef;
      // If path params exist, create intersection type
      if (pathParams.length > 0) {
        const paramParts = pathParams.map((p) => {
          const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(p.name) ? p.name : `"${p.name}"`;
          return `${key}: string`;
        });
        bodyInterfaceType = `${bodyRef} & { ${paramParts.join("; ")} }`;
      }
    }
  }

  const configParts = [...schemaConfig, ...typeConfig];

  // Build the endpoint() call
  let epCall: string;
  if (configParts.length > 0) {
    const hasSchemaVars = schemaConfig.some((s) => s.startsWith("variables:"));
    // Add vars generic when: no schema vars, OR body schema has explicit interface for JSDoc
    const effectiveVarsType = bodyInterfaceType ?? varsType;
    const needsVarsGeneric =
      effectiveVarsType &&
      effectiveVarsType !== "undefined" &&
      (!hasSchemaVars || bodyInterfaceType);
    if (needsVarsGeneric) {
      epCall = `endpoint<${responseType}, ${effectiveVarsType}>({ ${configParts.join(", ")} })`;
    } else {
      epCall = `endpoint({ ${configParts.join(", ")} })`;
    }
  } else {
    if (varsType && varsType !== "undefined") {
      epCall = `endpoint<${responseType}, ${varsType}>()`;
    } else {
      epCall = `endpoint<${responseType}>()`;
    }
  }

  // Build the function body
  const httpMethod = ep.httpMethod === "delete" ? "del" : ep.httpMethod;
  const path = ep.path === "/" ? "" : ep.path.replace(/^\//, "");

  // Determine if endpoint has variables (path params, body, or query params)
  const hasPathParams = ep.parameters.some((p) => p.in === "path");
  const hasQueryParams = ep.parameters.some((p) => p.in === "query");
  const hasBody = ep.requestBody !== null;
  const hasVars = hasPathParams || hasBody || hasQueryParams;

  let fnBody: string;
  if (hasVars) {
    fnBody = `(http, vars) => http.${httpMethod}("${path}"${path || hasVars ? ", vars" : ""})`;
  } else {
    fnBody = `(http) => http.${httpMethod}("${path}")`;
  }

  return `${epCall}(${fnBody})`;
}

// ── Type resolution ──────────────────────────────────────────────────────────

function resolveResponseType(
  ep: ParsedEndpoint,
  _spec: ParsedSpec,
  options: GenerateOptions,
): string {
  if (!ep.responseSchema) return "unknown";

  if (ep.responseSchema.type === "ref" && ep.responseSchema.refName) {
    const name = ep.responseSchema.refName;
    return options.generateTypes ? name : "unknown";
  }

  if (ep.responseSchema.type === "array" && ep.responseSchema.items?.type === "ref") {
    const name = ep.responseSchema.items.refName;
    return options.generateTypes && name ? `${name}[]` : "unknown[]";
  }

  return "unknown";
}

function resolveVariablesType(
  ep: ParsedEndpoint,
  _spec: ParsedSpec,
  options: GenerateOptions,
): string | null {
  const parts: string[] = [];

  // Path params — normalize hyphenated names to valid identifiers
  for (const param of ep.parameters.filter((p) => p.in === "path")) {
    const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(param.name) ? param.name : `"${param.name}"`;
    if (options.includeComments && param.description) {
      parts.push(`/** ${param.description} */ ${key}: string`);
    } else {
      parts.push(`${key}: string`);
    }
  }

  // Query params
  for (const param of ep.parameters.filter((p) => p.in === "query")) {
    const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(param.name) ? param.name : `"${param.name}"`;
    const optional = !param.required ? "?" : "";
    if (options.includeComments && param.description) {
      parts.push(`/** ${param.description} */ ${key}${optional}: ${tsType(param.type)}`);
    } else {
      parts.push(`${key}${optional}: ${tsType(param.type)}`);
    }
  }

  // Body ref — when schema-based validation handles it, path/query params
  // are merged via extendSchemaWithParams, so no generic needed.
  // When validation is "none", we need to combine body type + params.
  if (ep.requestBody?.type === "ref" && ep.requestBody.refName) {
    const hasSchemaValidation = options.generateSchemas && options.validation !== "none";
    if (hasSchemaValidation) {
      // Schema handles everything (body + path params via extend)
      return null;
    }
    // No schema validation — use intersection type
    if (parts.length > 0) {
      return `${ep.requestBody.refName} & { ${parts.join("; ")} }`;
    }
    return ep.requestBody.refName;
  }

  // Body inline
  if (ep.requestBody?.type === "object" && ep.requestBody.properties) {
    for (const [name, prop] of Object.entries(ep.requestBody.properties)) {
      if (!name) continue;
      const optional = !prop.required ? "?" : "";
      const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : `"${name}"`;
      parts.push(`${key}${optional}: ${tsType(prop.type)}`);
    }
  }

  if (parts.length === 0) return null;
  return `{ ${parts.join("; ")} }`;
}

/** Extend a schema expression with path param fields */
function extendSchemaWithParams(
  schemaExpr: string,
  paramNames: string[],
  options: GenerateOptions,
): string {
  if (paramNames.length === 0) return schemaExpr;

  if (options.validation === "zod") {
    const fields = paramNames.map((n) => `${n}: z.string()`).join(", ");
    return `${schemaExpr}.extend({ ${fields} })`;
  }
  if (options.validation === "valibot") {
    const fields = paramNames.map((n) => `${n}: v.string()`).join(", ");
    return `v.object({ ...${schemaExpr}.entries, ${fields} })`;
  }
  if (options.validation === "arktype") {
    const fields = paramNames.map((n) => `${n}: "string"`).join(", ");
    return `${schemaExpr}.and({ ${fields} })`;
  }

  return schemaExpr;
}

// ── Schema helpers ───────────────────────────────────────────────────────────

/** Topological sort: ensures schemas are emitted after their dependencies */
function topoSortSchemas(schemas: Record<string, ParsedSchema>): [string, ParsedSchema][] {
  const names = new Set(Object.keys(schemas));
  const visited = new Set<string>();
  const result: [string, ParsedSchema][] = [];

  function getDeps(schema: ParsedSchema): string[] {
    const deps: string[] = [];
    if (schema.type === "ref" && schema.refName && names.has(schema.refName)) {
      deps.push(schema.refName);
    }
    if (schema.properties) {
      for (const prop of Object.values(schema.properties)) {
        if (prop.refName && names.has(prop.refName)) deps.push(prop.refName);
        if (prop.items?.type === "ref" && prop.items.refName && names.has(prop.items.refName)) {
          deps.push(prop.items.refName);
        }
      }
    }
    if (schema.items?.type === "ref" && schema.items.refName && names.has(schema.items.refName)) {
      deps.push(schema.items.refName);
    }
    return deps;
  }

  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    const schema = schemas[name];
    if (!schema) return;
    for (const dep of getDeps(schema)) {
      visit(dep);
    }
    result.push([name, schema]);
  }

  for (const name of names) {
    visit(name);
  }
  return result;
}

function collectSchemaRefs(schema: ParsedSchema | null, refs: Set<string>): void {
  if (!schema) return;
  if (schema.type === "ref" && schema.refName) {
    refs.add(schema.refName);
    return;
  }
  if (schema.type === "array" && schema.items) {
    collectSchemaRefs(schema.items, refs);
  }
}

/** Collect all schemas needed by a group, including transitive $ref dependencies */
function collectGroupSchemas(group: ParsedGroup, spec: ParsedSpec): Set<string> {
  const direct = new Set<string>();
  for (const ep of group.endpoints) {
    collectSchemaRefs(ep.responseSchema, direct);
    collectSchemaRefs(ep.requestBody, direct);
  }

  // Resolve transitive deps: schema properties may reference other schemas
  const all = new Set<string>();
  const queue = [...direct];
  while (queue.length > 0) {
    const name = queue.pop();
    if (!name) continue;
    if (all.has(name)) continue;
    all.add(name);
    const schema = spec.schemas[name];
    if (!schema) continue;
    // Object properties can reference other schemas
    if (schema.properties) {
      for (const prop of Object.values(schema.properties)) {
        if (prop.refName && !all.has(prop.refName)) queue.push(prop.refName);
        if (prop.items?.type === "ref" && prop.items.refName && !all.has(prop.items.refName)) {
          queue.push(prop.items.refName);
        }
      }
    }
    // Array items
    if (schema.items?.type === "ref" && schema.items.refName && !all.has(schema.items.refName)) {
      queue.push(schema.items.refName);
    }
    // Ref alias
    if (schema.type === "ref" && schema.refName && !all.has(schema.refName)) {
      queue.push(schema.refName);
    }
  }
  return all;
}

/** Generate `satisfies ZodType<T>` / `satisfies GenericSchema<...>` expression for type-safe sync */
function satisfiesExpr(typeName: string, options: GenerateOptions): string {
  if (options.validation === "zod") return ` satisfies z.ZodType<${typeName}>`;
  if (options.validation === "valibot") return ` satisfies v.GenericSchema<any, ${typeName}>`;
  if (options.validation === "arktype") return ` satisfies { infer: ${typeName} }`;
  return "";
}

function getSchemaRefName(schema: ParsedSchema | null): string | null {
  if (!schema) return null;
  if (schema.type === "ref") return schema.refName ?? null;
  if (schema.type === "array" && schema.items?.type === "ref") return schema.items.refName ?? null;
  return null;
}

function schemaToValidation(schema: ParsedSchema, options: GenerateOptions): string {
  if (options.validation === "zod") return schemaToZod(schema);
  if (options.validation === "valibot") return schemaToValibot(schema);
  if (options.validation === "arktype") return schemaToArkType(schema);
  return "unknown";
}

function schemaToZod(schema: ParsedSchema): string {
  if (schema.type === "ref" && schema.refName) return `${schema.refName}Schema`;

  if (schema.type === "array") {
    const items = schema.items ? schemaToZod(schema.items) : "z.unknown()";
    return `z.array(${items})`;
  }

  if (schema.type === "enum" && schema.enum) {
    const filtered = schema.enum.filter((v) => v !== null && v !== undefined);
    const values = filtered.map((v) => (typeof v === "string" ? `"${v}"` : String(v)));
    return `z.enum([${values.join(", ")}])`;
  }

  if (schema.type === "object" && schema.properties) {
    const required = new Set(schema.required ?? []);
    const propLines: string[] = [];
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (!name) continue;
      let zodType = propToZod(prop);
      if (!required.has(name)) zodType += ".optional()";
      if (prop.nullable) zodType += ".nullable()";
      const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : `"${name}"`;
      propLines.push(`  ${key}: ${zodType}`);
    }
    if (propLines.length === 0) return "z.record(z.string(), z.unknown())";
    return `z.object({\n${propLines.join(",\n")},\n})`;
  }

  return primitiveToZod(schema.type);
}

function propToZod(prop: ParsedSchemaProperty): string {
  if (prop.refName) return `${prop.refName}Schema`;
  if (prop.enum) {
    const filtered = prop.enum.filter((v) => v !== null && v !== undefined);
    const values = filtered.map((v) => (typeof v === "string" ? `"${v}"` : String(v)));
    return `z.enum([${values.join(", ")}])`;
  }
  if (prop.type === "array" && prop.items) return `z.array(${schemaToZod(prop.items)})`;
  if (prop.type === "object") return "z.record(z.string(), z.unknown())";
  return primitiveToZod(prop.type, prop.format);
}

function primitiveToZod(type: string, format?: string): string {
  if (type === "string" && format === "email") return "z.string().email()";
  if (type === "string" && format === "date-time") return "z.string().datetime()";
  if (type === "string" && format === "uri") return "z.string().url()";
  if (type === "string" && format === "uuid") return "z.string().uuid()";
  if (type === "string") return "z.string()";
  if (type === "number" || type === "integer") return "z.number()";
  if (type === "boolean") return "z.boolean()";
  return "z.unknown()";
}

function schemaToValibot(schema: ParsedSchema): string {
  if (schema.type === "ref" && schema.refName) return `${schema.refName}Schema`;

  if (schema.type === "array") {
    const items = schema.items ? schemaToValibot(schema.items) : "v.unknown()";
    return `v.array(${items})`;
  }

  if (schema.type === "object" && schema.properties) {
    const required = new Set(schema.required ?? []);
    const propLines: string[] = [];
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (!name) continue;
      let valType = propToValibot(prop);
      if (!required.has(name)) valType = `v.optional(${valType})`;
      if (prop.nullable) valType = `v.nullable(${valType})`;
      const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : `"${name}"`;
      propLines.push(`  ${key}: ${valType}`);
    }
    if (propLines.length === 0) return "v.record(v.string(), v.unknown())";
    return `v.object({\n${propLines.join(",\n")},\n})`;
  }

  return primitiveToValibot(schema.type);
}

function propToValibot(prop: ParsedSchemaProperty): string {
  if (prop.refName) return `${prop.refName}Schema`;
  if (prop.type === "array" && prop.items) return `v.array(${schemaToValibot(prop.items)})`;
  if (prop.type === "object") return "v.record(v.string(), v.unknown())";
  return primitiveToValibot(prop.type, prop.format);
}

function primitiveToValibot(type: string, format?: string): string {
  if (type === "string" && format === "email") return `v.pipe(v.string(), v.email())`;
  if (type === "string" && format === "uri") return `v.pipe(v.string(), v.url())`;
  if (type === "string" && format === "uuid") return `v.pipe(v.string(), v.uuid())`;
  if (type === "string") return "v.string()";
  if (type === "number" || type === "integer") return "v.number()";
  if (type === "boolean") return "v.boolean()";
  return "v.unknown()";
}

// ── ArkType ──────────────────────────────────────────────────────────────────

function schemaToArkType(schema: ParsedSchema): string {
  if (schema.type === "ref" && schema.refName) return `${schema.refName}Schema`;

  if (schema.type === "array") {
    const items = schema.items ? schemaToArkType(schema.items) : "type('unknown')";
    return `${items}.array()`;
  }

  if (schema.type === "object" && schema.properties) {
    const required = new Set(schema.required ?? []);
    const propLines: string[] = [];
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (!name) continue;
      const key = required.has(name) ? name : `${name}?`;
      const arkType = propToArkType(prop);
      propLines.push(`  "${key}": ${arkType}`);
    }
    if (propLines.length === 0) return `type("Record<string, unknown>")`;
    return `type({\n${propLines.join(",\n")},\n})`;
  }

  return primitiveToArkType(schema.type);
}

function propToArkType(prop: ParsedSchemaProperty): string {
  if (prop.refName) return `${prop.refName}Schema`;
  if (prop.enum) {
    const filtered = prop.enum.filter((v) => v !== null && v !== undefined);
    const values = filtered.map((val) => (typeof val === "string" ? `"'${val}'"` : `"${val}"`));
    return `type(${values.join(" | ")})`;
  }
  if (prop.type === "array" && prop.items) return `${schemaToArkType(prop.items)}.array()`;
  if (prop.type === "object") return `type("Record<string, unknown>")`;
  const base = primitiveToArkType(prop.type, prop.format);
  if (prop.nullable) return `type(${base} | "null")`;
  return base;
}

function primitiveToArkType(type: string, format?: string): string {
  if (type === "string" && format === "email") return `type("string.email")`;
  if (type === "string" && format === "date-time") return `type("string.date.iso")`;
  if (type === "string" && format === "uri") return `type("string.url")`;
  if (type === "string" && format === "uuid") return `type("string.uuid")`;
  if (type === "string") return `"string"`;
  if (type === "number" || type === "integer") return `"number"`;
  if (type === "boolean") return `"boolean"`;
  return `"unknown"`;
}

// ── TS type generation ───────────────────────────────────────────────────────

function schemaToInterface(schema: ParsedSchema): string {
  if (schema.type !== "object" || !schema.properties) return "{}";

  const required = new Set(schema.required ?? []);
  const lines: string[] = [];
  for (const [name, prop] of Object.entries(schema.properties)) {
    if (!name) continue;
    const optional = !required.has(name) ? "?" : "";
    const nullable = prop.nullable ? " | null" : "";
    const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : `"${name}"`;
    if (prop.description) lines.push(`  /** ${prop.description} */`);
    lines.push(`  ${key}${optional}: ${tsType(prop.type, prop.format)}${nullable};`);
  }

  return `{\n${lines.join("\n")}\n};`;
}

function tsType(type: string, _format?: string): string {
  if (type === "ref") return "unknown";
  if (type === "integer") return "number";
  if (type === "array") return "unknown[]";
  if (["string", "number", "boolean"].includes(type)) return type;
  return "unknown";
}
