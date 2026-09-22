/**
 * ArkType schema generation from parsed schemas.
 *
 * ArkType reads its types from STRINGS: `type("string | null")` is a union,
 * while `type("string" | "null")` is a JavaScript bitwise-or of two strings —
 * it evaluates to `0`, and ArkType rejects it at load. Everything here keeps
 * the two apart: `arkExpression` builds the text ArkType parses, and the
 * exported functions wrap it in a call exactly once.
 */

import type { ParsedSchema, ParsedSchemaProperty } from "../parser/types";
import { jsLiteral, type SpecValue } from "./literals";

/** Build a type object from an ArkType expression. */
function arkType(expression: string): string {
  return `type(${jsLiteral(expression)})`;
}

export function schemaToArkType(schema: ParsedSchema): string {
  if (schema.type === "ref" && schema.refName) return `${schema.refName}Schema`;

  if (schema.type === "array") {
    /* Always a type object, so `.array()` has something to be called on. */
    const items = schema.items ? schemaToArkType(schema.items) : arkType("unknown");
    return `${items}.array()`;
  }

  if (schema.type === "enum" && schema.enum) {
    return arkType(enumExpression(schema.enum) ?? "string");
  }

  if (schema.type === "object" && schema.properties) {
    const required = new Set(schema.required ?? []);
    const propLines: string[] = [];
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (!name) continue;
      const key = required.has(name) ? name : `${name}?`;
      propLines.push(`  ${jsLiteral(key)}: ${propToArkType(prop)}`);
    }
    if (propLines.length === 0) return arkType("Record<string, unknown>");
    return `type({\n${propLines.join(",\n")},\n})`;
  }

  return primitiveToArkType(schema.type);
}

export function propToArkType(prop: ParsedSchemaProperty): string {
  if (prop.refName) return `${prop.refName}Schema`;

  if (prop.enum) {
    const members = enumExpression(prop.enum) ?? arkExpression(prop.type, prop.format);
    return arkType(prop.nullable ? `${members} | null` : members);
  }

  if (prop.type === "array" && prop.items) return `${schemaToArkType(prop.items)}.array()`;
  if (prop.type === "object") return arkType("Record<string, unknown>");

  const base = arkExpression(prop.type, prop.format);
  return arkType(prop.nullable ? `${base} | null` : base);
}

export function primitiveToArkType(type: string, format?: string): string {
  return arkType(arkExpression(type, format));
}

/** The ArkType text for a primitive, without the surrounding call. */
function arkExpression(type: string, format?: string): string {
  if (type === "string" && format === "email") return "string.email";
  if (type === "string" && format === "date-time") return "string.date.iso";
  if (type === "string" && format === "uri") return "string.url";
  if (type === "string" && format === "uuid") return "string.uuid";
  if (type === "string") return "string";
  if (type === "number" || type === "integer") return "number";
  if (type === "boolean") return "boolean";
  return "unknown";
}

/**
 * The ArkType union for a set of enum members.
 *
 * ArkType writes a string member between quotes and offers no escape for a
 * member containing both kinds, so such a set is given up on rather than
 * written wrongly.
 */
function enumExpression(values: readonly (SpecValue | null | undefined)[]): string | undefined {
  const members: string[] = [];
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const member = arkLiteral(value);
    if (member === undefined) return undefined;
    members.push(member);
  }
  return members.length > 0 ? members.join(" | ") : undefined;
}

function arkLiteral(value: SpecValue): string | undefined {
  if (typeof value !== "string") return String(value);
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  return undefined;
}
