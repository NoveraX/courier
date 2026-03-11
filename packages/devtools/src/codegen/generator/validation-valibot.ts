/**
 * Valibot schema generation from parsed schemas.
 */

import type { ParsedSchema, ParsedSchemaProperty } from "../parser/types";

export function schemaToValibot(schema: ParsedSchema): string {
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

export function propToValibot(prop: ParsedSchemaProperty): string {
  if (prop.refName) return `${prop.refName}Schema`;
  if (prop.type === "array" && prop.items) return `v.array(${schemaToValibot(prop.items)})`;
  if (prop.type === "object") return "v.record(v.string(), v.unknown())";
  return primitiveToValibot(prop.type, prop.format);
}

export function primitiveToValibot(type: string, format?: string): string {
  if (type === "string" && format === "email") return `v.pipe(v.string(), v.email())`;
  if (type === "string" && format === "uri") return `v.pipe(v.string(), v.url())`;
  if (type === "string" && format === "uuid") return `v.pipe(v.string(), v.uuid())`;
  if (type === "string") return "v.string()";
  if (type === "number" || type === "integer") return "v.number()";
  if (type === "boolean") return "v.boolean()";
  return "v.unknown()";
}
