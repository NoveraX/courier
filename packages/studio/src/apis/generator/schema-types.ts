/**
 * TypeScript type generation from parsed schemas.
 */

import type { ParsedEndpoint, ParsedSchema, ParsedSpec } from "../parser/types";
import { propToTsType, schemaToTsType } from "./inline-types";
import { jsdocText } from "./jsdoc-text";
import { objectKey } from "./literals";
import type { GenerateOptions } from "./types";

export function schemaToInterface(schema: ParsedSchema): string {
  /* A schema that is not an object still has a type — a union of alternatives,
     an array, an enum — and answering `{}` described it as an empty one. */
  if (schema.type !== "object" || !schema.properties) return `${schemaToTsType(schema)};`;

  const required = new Set(schema.required ?? []);
  const lines: string[] = [];
  for (const [name, prop] of Object.entries(schema.properties)) {
    if (!name) continue;
    const optional = !required.has(name) ? "?" : "";
    const nullable = prop.nullable ? " | null" : "";
    const key = objectKey(name);
    if (prop.description) lines.push(`  /** ${jsdocText(prop.description)} */`);
    lines.push(`  ${key}${optional}: ${propToTsType(prop)}${nullable};`);
  }

  return `{\n${lines.join("\n")}\n};`;
}

export function tsType(type: string, _format?: string): string {
  if (type === "ref") return "unknown";
  if (type === "integer") return "number";
  if (type === "array") return "unknown[]";
  if (["string", "number", "boolean"].includes(type)) return type;
  return "unknown";
}

export function resolveResponseType(
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

  return schemaToTsType(ep.responseSchema);
}

export function resolveVariablesType(
  ep: ParsedEndpoint,
  spec: ParsedSpec,
  options: GenerateOptions,
): string | null {
  const parts: string[] = [];

  // Path params — normalize hyphenated names to valid identifiers
  for (const param of ep.parameters.filter((p) => p.in === "path")) {
    const key = objectKey(param.name);
    if (options.includeComments && param.description) {
      parts.push(`/** ${jsdocText(param.description)} */ ${key}: string`);
    } else {
      parts.push(`${key}: string`);
    }
  }

  // Query params
  for (const param of ep.parameters.filter((p) => p.in === "query")) {
    const key = objectKey(param.name);
    const optional = !param.required ? "?" : "";
    if (options.includeComments && param.description) {
      parts.push(`/** ${jsdocText(param.description)} */ ${key}${optional}: ${tsType(param.type)}`);
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
    /* Without a types file there is no name to refer to, so the body's shape
       is written out where it is used. */
    const body = options.generateTypes
      ? ep.requestBody.refName
      : inlineShape(spec, ep.requestBody.refName, options);
    if (parts.length > 0) {
      return `${body} & { ${parts.join("; ")} }`;
    }
    return body;
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

/**
 * Write a referenced schema out as an object type.
 *
 * Used where no types file is generated, so there is no name to refer to.
 */
function inlineShape(spec: ParsedSpec, refName: string, options: GenerateOptions): string {
  const schema = spec.schemas[refName];
  if (!schema?.properties) return "Record<string, unknown>";

  const parts: string[] = [];
  for (const [name, prop] of Object.entries(schema.properties)) {
    if (!name) continue;
    const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : `"${name}"`;
    const optional = prop.required ? "" : "?";
    const doc =
      options.includeComments && prop.description ? `/** ${jsdocText(prop.description)} */ ` : "";
    parts.push(`${doc}${key}${optional}: ${tsType(prop.type)}`);
  }
  return parts.length > 0 ? `{ ${parts.join("; ")} }` : "Record<string, unknown>";
}
