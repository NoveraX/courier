/**
 * OpenAPI / Swagger / Postman spec parser.
 * Extracts endpoints, schemas, tags, security info into a normalized structure.
 */

import { parse as parseYaml } from "yaml";

// ── Normalized types ─────────────────────────────────────────────────────────

export interface ParsedSpec {
  title: string;
  version: string;
  description: string;
  baseURL: string;
  format: "openapi3" | "swagger2" | "postman";
  groups: ParsedGroup[];
  schemas: Record<string, ParsedSchema>;
  securitySchemes: ParsedSecurityScheme[];
}

export interface ParsedSecurityScheme {
  name: string;
  type: "bearer" | "apiKey" | "basic" | "oauth2" | "unknown";
  /** Header/query param name for apiKey type */
  paramName?: string;
  /** Where the key is sent for apiKey type */
  in?: "header" | "query" | "cookie";
}

export interface ParsedGroup {
  name: string;
  /** Tag description from the spec (for JSDoc generation) */
  description: string;
  prefix: string;
  endpoints: ParsedEndpoint[];
}

export interface ParsedEndpoint {
  /** Suggested camelCase name, e.g. "getById" */
  name: string;
  /** Original operation ID from spec */
  operationId: string | null;
  /** HTTP method */
  httpMethod: "get" | "post" | "put" | "patch" | "delete";
  /** Path relative to group prefix, e.g. "/:id" */
  path: string;
  /** Full original path, e.g. "/users/{id}" */
  fullPath: string;
  /** OpenAPI summary / description */
  description: string;
  /** Is this secured (has security scheme) */
  secured: boolean;
  /** Request body schema (if any) */
  requestBody: ParsedSchema | null;
  /** Path + query parameters */
  parameters: ParsedParameter[];
  /** Response schema (from 200/201 response) */
  responseSchema: ParsedSchema | null;
  /** Tags from spec */
  tags: string[];
}

export interface ParsedParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  type: string;
  description: string;
}

export interface ParsedSchema {
  name: string;
  type: "object" | "array" | "string" | "number" | "integer" | "boolean" | "enum" | "ref" | "any";
  properties?: Record<string, ParsedSchemaProperty>;
  items?: ParsedSchema;
  enum?: (string | number)[];
  required?: string[];
  /** Reference name for $ref schemas */
  refName?: string;
  description?: string;
}

export interface ParsedSchemaProperty {
  type: string;
  format?: string;
  required: boolean;
  description?: string;
  enum?: (string | number)[];
  items?: ParsedSchema;
  refName?: string;
  nullable?: boolean;
}

// ── Detect format ────────────────────────────────────────────────────────────

export type SpecFormat =
  | "openapi3-json"
  | "openapi3-yaml"
  | "swagger2-json"
  | "swagger2-yaml"
  | "postman"
  | "unknown";

export function detectFormat(raw: string): SpecFormat {
  const trimmed = raw.trim();

  // Try JSON first
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj.openapi && obj.openapi.startsWith("3")) return "openapi3-json";
      if (obj.swagger && obj.swagger.startsWith("2")) return "swagger2-json";
      if (obj.info && obj.item) return "postman"; // Postman collection
      return "unknown";
    } catch {
      return "unknown";
    }
  }

  // Try YAML
  if (trimmed.startsWith("openapi:") || trimmed.includes("\nopenapi:")) return "openapi3-yaml";
  if (trimmed.startsWith("swagger:") || trimmed.includes("\nswagger:")) return "swagger2-yaml";

  return "unknown";
}

// ── Main parser ──────────────────────────────────────────────────────────────

export function parseSpec(raw: string): ParsedSpec {
  const format = detectFormat(raw);

  if (format === "unknown") {
    throw new Error(
      "Unable to detect spec format. Supported: OpenAPI 3.x (JSON/YAML), Swagger 2.0 (JSON/YAML), Postman Collection.",
    );
  }

  const parsed = format.endsWith("-yaml") ? parseYaml(raw) : JSON.parse(raw);

  if (format === "postman") return parsePostman(parsed);
  if (format.startsWith("swagger2")) return parseSwagger2(parsed);
  return parseOpenApi3(parsed);
}

// ── OpenAPI 3.x ──────────────────────────────────────────────────────────────

function parseOpenApi3(spec: any): ParsedSpec {
  const title = spec.info?.title ?? "API";
  const version = spec.info?.version ?? "1.0.0";
  const description = spec.info?.description
    ? stripHtmlPreserveNewlines(spec.info.description)
    : "";

  // Determine base URL
  let baseURL = "/";
  if (spec.servers?.length > 0) {
    baseURL = spec.servers[0].url ?? "/";
  }

  const schemas: Record<string, ParsedSchema> = {};
  if (spec.components?.schemas) {
    for (const [name, schema] of Object.entries(spec.components.schemas)) {
      const safeName = toSafeIdentifier(name);
      // Deduplicate: skip if a schema with same normalized name already exists
      if (schemas[safeName]) continue;
      schemas[safeName] = convertSchema(safeName, schema as any);
    }
  }

  const endpointsByTag = new Map<string, ParsedEndpoint[]>();

  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods as any)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;

      const op = operation as any;
      const tags = op.tags?.length > 0 ? op.tags : ["default"];
      const tag = tags[0] as string;

      const endpoint = parseOpenApi3Operation(path, method, op, spec);
      endpoint.tags = tags;

      if (!endpointsByTag.has(tag)) endpointsByTag.set(tag, []);
      endpointsByTag.get(tag)!.push(endpoint);
    }
  }

  // Build tag description map from top-level tags array
  const tagDescriptions = new Map<string, string>();
  if (Array.isArray(spec.tags)) {
    for (const tag of spec.tags) {
      if (tag.name && tag.description) {
        tagDescriptions.set(tag.name, stripHtml(tag.description));
      }
    }
  }

  const groups: ParsedGroup[] = [];
  const usedNames = new Set<string>();
  for (const [tag, endpoints] of endpointsByTag) {
    const prefix = findCommonPrefix(endpoints.map((e) => e.fullPath));
    let name = toCamelCase(tag);

    // Fallback for empty names (e.g. Cyrillic-only tags that became empty)
    if (!name) {
      const lastSegment = prefix.split("/").filter(Boolean).pop();
      name = lastSegment ? toCamelCase(lastSegment) : "default";
    }

    // Deduplicate group names
    if (usedNames.has(name)) {
      let i = 2;
      while (usedNames.has(`${name}${i}`)) i++;
      name = `${name}${i}`;
    }
    usedNames.add(name);

    groups.push({
      name,
      description: tagDescriptions.get(tag) ?? "",
      prefix,
      endpoints: endpoints.map((e) => ({
        ...e,
        path: convertPathParams(e.fullPath.slice(prefix.length) || "/"),
      })),
    });
  }

  const securitySchemes = parseSecuritySchemes(spec);

  return {
    title,
    version,
    description,
    baseURL,
    format: "openapi3",
    groups,
    schemas,
    securitySchemes,
  };
}

function parseOpenApi3Operation(path: string, method: string, op: any, spec: any): ParsedEndpoint {
  // Parameters
  const parameters: ParsedParameter[] = [];
  for (const param of op.parameters ?? []) {
    const resolved = param.$ref ? resolveRef(spec, param.$ref) : param;
    // Normalize param name: replace hyphens with underscores for valid JS identifiers
    const name = (resolved.name as string).replace(/-/g, "_");
    parameters.push({
      name,
      in: resolved.in,
      required: resolved.required ?? false,
      type: resolved.schema?.type ?? "string",
      description: resolved.description ?? "",
    });
  }

  // Request body
  let requestBody: ParsedSchema | null = null;
  if (op.requestBody) {
    const body = op.requestBody.$ref ? resolveRef(spec, op.requestBody.$ref) : op.requestBody;
    const jsonContent = body.content?.["application/json"];
    if (jsonContent?.schema) {
      requestBody = convertSchemaInline(jsonContent.schema, spec);
    }
  }

  // Response schema (200 or 201)
  let responseSchema: ParsedSchema | null = null;
  const successResponse = op.responses?.["200"] ?? op.responses?.["201"];
  if (successResponse) {
    const resp = successResponse.$ref ? resolveRef(spec, successResponse.$ref) : successResponse;
    const jsonContent = resp.content?.["application/json"];
    if (jsonContent?.schema) {
      responseSchema = convertSchemaInline(jsonContent.schema, spec);
    }
  }

  // Security
  const secured = !!(op.security?.length > 0 || (!op.security && spec.security?.length > 0));

  // Name
  const operationId = op.operationId ?? null;
  const name = operationId ? toCamelCase(operationId) : generateEndpointName(method, path);

  return {
    name,
    operationId,
    httpMethod: method as ParsedEndpoint["httpMethod"],
    path: convertPathParams(path),
    fullPath: path,
    description: op.summary ?? op.description ?? "",
    secured,
    requestBody,
    parameters,
    responseSchema,
    tags: [],
  };
}

// ── Swagger 2.0 → OpenAPI 3.x conversion ────────────────────────────────────

function parseSwagger2(spec: any): ParsedSpec {
  // Convert Swagger 2.0 to OpenAPI 3.x-like structure, then parse
  const converted: any = {
    openapi: "3.0.0",
    info: spec.info,
    servers: [{ url: spec.basePath ?? "/" }],
    paths: {},
    components: { schemas: spec.definitions ?? {} },
  };

  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    converted.paths[path] = {};
    for (const [method, operation] of Object.entries(methods as any)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;

      const op = { ...(operation as any) };

      // Convert body parameters to requestBody
      const bodyParam = op.parameters?.find((p: any) => p.in === "body");
      if (bodyParam) {
        op.requestBody = {
          content: {
            "application/json": {
              schema: bodyParam.schema,
            },
          },
        };
        op.parameters = op.parameters?.filter((p: any) => p.in !== "body");
      }

      // Convert responses (Swagger 2 has schema directly, not under content)
      if (op.responses) {
        for (const [code, response] of Object.entries(op.responses)) {
          const resp = response as any;
          if (resp.schema) {
            op.responses[code] = {
              description: resp.description,
              content: {
                "application/json": {
                  schema: resp.schema,
                },
              },
            };
          }
        }
      }

      converted.paths[path][method] = op;
    }
  }

  const result = parseOpenApi3(converted);
  result.format = "swagger2" as any;
  return result;
}

// ── Postman Collection ───────────────────────────────────────────────────────

function parsePostman(collection: any): ParsedSpec {
  const title = collection.info?.name ?? "Postman Collection";
  const version = collection.info?.version ?? "1.0.0";

  const groups: ParsedGroup[] = [];

  function processItems(items: any[], groupName: string) {
    const endpoints: ParsedEndpoint[] = [];

    for (const item of items) {
      if (item.item) {
        // Nested folder → separate group
        processItems(item.item, item.name ?? groupName);
        continue;
      }

      const request = item.request;
      if (!request) continue;

      const method = (request.method ?? "GET").toLowerCase();
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;

      const url = typeof request.url === "string" ? request.url : (request.url?.raw ?? "");
      const path = extractPostmanPath(url);

      let requestBody: ParsedSchema | null = null;
      if (request.body?.mode === "raw" && request.body.raw) {
        try {
          const bodyObj = JSON.parse(request.body.raw);
          requestBody = inferSchemaFromValue("RequestBody", bodyObj);
        } catch {
          /* not JSON */
        }
      }

      endpoints.push({
        name: toCamelCase(item.name ?? `${method}${path}`),
        operationId: null,
        httpMethod: method as ParsedEndpoint["httpMethod"],
        path: convertPathParams(path),
        fullPath: path,
        description: item.name ?? "",
        secured: false,
        requestBody,
        parameters: [],
        responseSchema: null,
        tags: [groupName],
      });
    }

    if (endpoints.length > 0) {
      const prefix = findCommonPrefix(endpoints.map((e) => e.fullPath));
      groups.push({
        name: toCamelCase(groupName),
        description: "",
        prefix,
        endpoints: endpoints.map((e) => ({
          ...e,
          path: convertPathParams(e.fullPath.slice(prefix.length) || "/"),
        })),
      });
    }
  }

  processItems(collection.item ?? [], "default");

  return {
    title,
    version,
    description: "",
    baseURL: "/",
    format: "postman",
    groups,
    schemas: {},
    securitySchemes: [],
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveRef(spec: any, ref: string): any {
  const parts = ref.replace("#/", "").split("/");
  let result = spec;
  for (const part of parts) {
    result = result?.[part];
  }
  return result ?? {};
}

function convertSchema(name: string, schema: any): ParsedSchema {
  // Handle $ref at top level (schema aliases)
  if (schema.$ref) {
    const refName = toSafeIdentifier(schema.$ref.split("/").pop());
    return { name, type: "ref", refName, description: schema.description };
  }

  // Handle allOf — merge all sub-schemas into a single object
  if (schema.allOf) {
    const merged: any = {
      type: "object",
      properties: {},
      required: [],
      description: schema.description,
    };
    for (const sub of schema.allOf) {
      if (sub.$ref) {
        // For $ref in allOf, we can't fully resolve without the spec context,
        // but we mark it so the generator can handle it
        continue;
      }
      if (sub.properties) {
        Object.assign(merged.properties, sub.properties);
      }
      if (sub.required) {
        merged.required.push(...sub.required);
      }
      if (sub.enum) merged.enum = sub.enum;
      if (sub.type) merged.type = sub.type;
    }
    if (merged.enum) {
      return { name, type: "enum", enum: merged.enum, description: schema.description };
    }
    if (Object.keys(merged.properties).length > 0) {
      return convertSchema(name, merged);
    }
    // If allOf only contains $refs, treat as ref to first one
    const firstRef = schema.allOf.find((s: any) => s.$ref);
    if (firstRef) {
      const refName = toSafeIdentifier(firstRef.$ref.split("/").pop());
      return { name, type: "ref", refName, description: schema.description };
    }
  }

  // Handle oneOf / anyOf — treat as enum if all are literals, otherwise use first
  if (schema.oneOf || schema.anyOf) {
    const variants = schema.oneOf || schema.anyOf;
    // Check if all variants are simple string enums
    const allEnums = variants.every((v: any) => v.enum || v.const !== undefined);
    if (allEnums) {
      const values: (string | number)[] = [];
      for (const v of variants) {
        if (v.enum) values.push(...v.enum);
        else if (v.const !== undefined) values.push(v.const);
      }
      return { name, type: "enum", enum: values, description: schema.description };
    }
    // Otherwise, try to convert the first variant
    if (variants[0]) return convertSchema(name, variants[0]);
  }

  if (schema.enum) {
    return { name, type: "enum", enum: schema.enum, description: schema.description };
  }

  if (schema.type === "array") {
    return {
      name,
      type: "array",
      items: schema.items ? convertSchema(`${name}Item`, schema.items) : undefined,
      description: schema.description,
    };
  }

  if (schema.type === "object" || schema.properties) {
    const properties: Record<string, ParsedSchemaProperty> = {};
    const requiredFields = new Set(schema.required ?? []);

    for (const [propName, propSchema] of Object.entries(schema.properties ?? {})) {
      const prop = propSchema as any;

      // Resolve $ref or allOf/oneOf/anyOf at property level
      let resolvedProp = prop;
      if (prop.allOf) {
        // Merge allOf into a single schema, or pick first $ref
        const firstRef = prop.allOf.find((s: any) => s.$ref);
        if (firstRef) {
          resolvedProp = { ...firstRef, description: prop.description, nullable: prop.nullable };
        } else {
          const merged: any = {};
          for (const sub of prop.allOf) {
            Object.assign(merged, sub);
          }
          resolvedProp = {
            ...merged,
            description: prop.description ?? merged.description,
            nullable: prop.nullable ?? merged.nullable,
          };
        }
      } else if ((prop.oneOf || prop.anyOf) && !prop.type) {
        const variants = prop.oneOf || prop.anyOf;
        const firstRef = variants.find((s: any) => s.$ref);
        if (firstRef) {
          resolvedProp = { ...firstRef, description: prop.description, nullable: prop.nullable };
        }
      }

      properties[propName] = {
        type: resolvedProp.$ref ? "ref" : (resolvedProp.type ?? "any"),
        format: resolvedProp.format,
        required: requiredFields.has(propName),
        description: resolvedProp.description ?? prop.description,
        enum: resolvedProp.enum,
        refName: resolvedProp.$ref
          ? toSafeIdentifier(resolvedProp.$ref.split("/").pop())
          : undefined,
        nullable: resolvedProp.nullable ?? prop.nullable,
        items: resolvedProp.items
          ? convertSchema(`${propName}Item`, resolvedProp.items)
          : undefined,
      };
    }

    return {
      name,
      type: "object",
      properties,
      required: [...requiredFields] as string[],
      description: schema.description,
    };
  }

  if (["string", "number", "integer", "boolean"].includes(schema.type)) {
    return { name, type: schema.type, description: schema.description };
  }

  return { name, type: "any", description: schema.description };
}

function convertSchemaInline(schema: any, spec: any): ParsedSchema {
  if (schema.$ref) {
    const rawName = schema.$ref.split("/").pop();
    const refName = toSafeIdentifier(rawName);
    return { name: refName, type: "ref", refName };
  }

  // Handle allOf/oneOf/anyOf inline
  if (schema.allOf || schema.oneOf || schema.anyOf) {
    return convertSchema("Inline", schema);
  }

  if (schema.type === "array" && schema.items) {
    return {
      name: "Array",
      type: "array",
      items: convertSchemaInline(schema.items, spec),
    };
  }

  if (schema.type === "object" || schema.properties) {
    return convertSchema("Inline", schema);
  }

  return { name: schema.type ?? "any", type: schema.type ?? "any" };
}

function inferSchemaFromValue(name: string, value: unknown): ParsedSchema {
  if (Array.isArray(value)) {
    return {
      name,
      type: "array",
      items: value.length > 0 ? inferSchemaFromValue(`${name}Item`, value[0]) : undefined,
    };
  }

  if (value !== null && typeof value === "object") {
    const properties: Record<string, ParsedSchemaProperty> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      properties[key] = {
        type: typeof val === "number" ? "number" : typeof val === "boolean" ? "boolean" : "string",
        required: true,
      };
    }
    return { name, type: "object", properties, required: Object.keys(properties) };
  }

  return { name, type: typeof value as ParsedSchema["type"] };
}

/** Strip HTML tags and decode basic entities from tag descriptions */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip HTML but preserve newlines (for multi-line descriptions) */
function stripHtmlPreserveNewlines(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

/** Convert OpenAPI path params `{id}` to Nexus-style `:id` */
function convertPathParams(path: string): string {
  return path.replace(/\{([\w-]+)\}/g, (_, name) => `:${name.replace(/-/g, "_")}`);
}

/** Extract path from Postman URL (strip protocol, host, query) */
function extractPostmanPath(url: string): string {
  try {
    const u = new URL(url.replace(/\{\{.*?\}\}/g, "localhost"));
    return u.pathname;
  } catch {
    // fallback: strip query params
    return url.split("?")[0] ?? url;
  }
}

/** Find common path prefix from a set of paths */
function findCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return "/";
  if (paths.length === 1) {
    // For single path, take everything up to last segment
    const first = paths[0] ?? "";
    const parts = first.split("/").filter(Boolean);
    if (parts.length <= 1) return "/";
    return "/" + parts.slice(0, -1).join("/");
  }

  const segments = paths.map((p) => p.split("/").filter(Boolean));
  const minLen = Math.min(...segments.map((s) => s.length));
  const common: string[] = [];
  const firstSegments = segments[0] ?? [];

  for (let i = 0; i < minLen; i++) {
    const segment = firstSegments[i];
    if (!segment || segment.startsWith("{") || segment.startsWith(":")) break;
    if (segments.every((s) => s[i] === segment)) {
      common.push(segment);
    } else break;
  }

  return common.length > 0 ? "/" + common.join("/") : "/";
}

/** Normalize a schema/type name into a valid JS identifier (PascalCase). */
function toSafeIdentifier(name: string): string {
  const camel = toCamelCase(name);
  if (!camel) return "Unknown";
  // PascalCase for types/schemas
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/** Convert string to a safe camelCase JS identifier.
 *  Handles: hyphens, underscores, dots, Cyrillic tags, abbreviations (SSH→ssh, API→api). */
function toCamelCase(str: string): string {
  // Transliterate Cyrillic to Latin (basic Russian alphabet)
  const transliterated = transliterate(str);

  // All-uppercase abbreviation (SSH, API, IP, AI, VPC) → lowercase
  if (/^[A-Z][A-Z0-9]*$/.test(transliterated)) return transliterated.toLowerCase();

  return (
    transliterated
      // Insert boundary between lowercase/digit and uppercase: "floatingIp" → "floating Ip"
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      // Replace non-alphanumeric with space
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .map((word, i) => {
        const lower = word.toLowerCase();
        return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join("")
  );
}

const CYRILLIC_MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function transliterate(str: string): string {
  let result = "";
  for (const ch of str) {
    const lower = ch.toLowerCase();
    if (CYRILLIC_MAP[lower] !== undefined) {
      const mapped = CYRILLIC_MAP[lower];
      result += ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
    } else {
      result += ch;
    }
  }
  return result;
}

/** Generate endpoint name from method + path when no operationId */
function generateEndpointName(method: string, path: string): string {
  const segments = path.split("/").filter((s) => s && !s.startsWith("{") && !s.startsWith(":"));
  const lastSegment = segments.pop() ?? "";
  const isPlural = lastSegment.endsWith("s");

  // Simple heuristics
  const hasPathParam = path.includes("{") || path.includes(":");

  if (method === "get" && !hasPathParam) return `getAll${!isPlural ? toPascal(lastSegment) : ""}`;
  if (method === "get" && hasPathParam) return `getById`;
  if (method === "post") return `create`;
  if (method === "put" || method === "patch") return `update`;
  if (method === "delete") return `remove`;

  return toCamelCase(`${method}_${lastSegment}`);
}

function toPascal(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/** Parse security schemes from OpenAPI 3 or Swagger 2 spec */
function parseSecuritySchemes(spec: any): ParsedSecurityScheme[] {
  // OpenAPI 3: components.securitySchemes
  // Swagger 2: securityDefinitions
  const raw = spec.components?.securitySchemes ?? spec.securityDefinitions ?? {};
  const schemes: ParsedSecurityScheme[] = [];

  for (const [name, def] of Object.entries(raw)) {
    const d = def as any;
    if (d.type === "http" && d.scheme === "bearer") {
      schemes.push({ name, type: "bearer" });
    } else if (d.type === "http" && d.scheme === "basic") {
      schemes.push({ name, type: "basic" });
    } else if (d.type === "apiKey") {
      schemes.push({ name, type: "apiKey", paramName: d.name, in: d.in });
    } else if (d.type === "oauth2") {
      schemes.push({ name, type: "oauth2" });
    } else {
      schemes.push({ name, type: "unknown" });
    }
  }

  return schemes;
}
