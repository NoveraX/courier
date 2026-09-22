/**
 * Converts ParsedSchema to inline TypeScript type strings.
 */

import type { ParsedSchema, ParsedSchemaProperty } from "../parser/types";
import { typeUnion } from "./enum-literals";

/** Convert a ParsedSchema to an inline TypeScript type string */
export function schemaToTsType(schema: ParsedSchema): string {
  if (schema.type === "ref" && schema.refName) return schema.refName;
  if (schema.type === "array") {
    if (!schema.items) return "unknown[]";
    const inner = schemaToTsType(schema.items);
    return inner.includes("|") ? `(${inner})[]` : `${inner}[]`;
  }
  if (schema.type === "enum" && schema.enum) {
    return typeUnion(schema.enum);
  }
  if (schema.type === "object" && schema.properties) {
    return objectToTsType(schema);
  }
  return primitiveToTsType(schema.type);
}

function objectToTsType(schema: ParsedSchema): string {
  const required = new Set(schema.required ?? []);
  const props: string[] = [];
  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    if (!name) continue;
    const opt = !required.has(name) ? "?" : "";
    const nullable = prop.nullable ? " | null" : "";
    const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : `"${name}"`;
    props.push(`${key}${opt}: ${propToTsType(prop)}${nullable}`);
  }
  if (props.length === 0) return "Record<string, unknown>";
  return `{ ${props.join("; ")} }`;
}

export function propToTsType(prop: ParsedSchemaProperty): string {
  if (prop.refName) return prop.refName;
  if (prop.enum) {
    return typeUnion(prop.enum);
  }
  if (prop.type === "array" && prop.items) {
    const inner = schemaToTsType(prop.items);
    return inner.includes("|") ? `(${inner})[]` : `${inner}[]`;
  }
  if (prop.type === "object") return "Record<string, unknown>";
  return primitiveToTsType(prop.type);
}

function primitiveToTsType(type: string): string {
  if (type === "integer") return "number";
  if (["string", "number", "boolean"].includes(type)) return type;
  return "unknown";
}
