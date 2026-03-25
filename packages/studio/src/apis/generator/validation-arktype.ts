/**
 * ArkType schema generation from parsed schemas.
 */

import type { ParsedSchema, ParsedSchemaProperty } from "../parser/types";

export function schemaToArkType(schema: ParsedSchema): string {
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

export function propToArkType(prop: ParsedSchemaProperty): string {
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

export function primitiveToArkType(type: string, format?: string): string {
  if (type === "string" && format === "email") return `type("string.email")`;
  if (type === "string" && format === "date-time") return `type("string.date.iso")`;
  if (type === "string" && format === "uri") return `type("string.url")`;
  if (type === "string" && format === "uuid") return `type("string.uuid")`;
  if (type === "string") return `"string"`;
  if (type === "number" || type === "integer") return `"number"`;
  if (type === "boolean") return `"boolean"`;
  return `"unknown"`;
}
