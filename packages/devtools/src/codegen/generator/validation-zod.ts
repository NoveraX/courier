/**
 * Zod schema generation from parsed schemas.
 */

import type { ParsedSchema, ParsedSchemaProperty } from "../parser/types";

export function schemaToZod(schema: ParsedSchema): string {
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

export function propToZod(prop: ParsedSchemaProperty): string {
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

export function primitiveToZod(type: string, format?: string): string {
  if (type === "string" && format === "email") return "z.string().email()";
  if (type === "string" && format === "date-time") return "z.string().datetime()";
  if (type === "string" && format === "uri") return "z.string().url()";
  if (type === "string" && format === "uuid") return "z.string().uuid()";
  if (type === "string") return "z.string()";
  if (type === "number" || type === "integer") return "z.number()";
  if (type === "boolean") return "z.boolean()";
  return "z.unknown()";
}
