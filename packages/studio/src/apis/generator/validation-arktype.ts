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

/**
 * How a reference to another schema is written.
 *
 * Normally it names the exported constant. Inside a `type.module` it names the
 * member instead, which is the only way ArkType lets two definitions refer to
 * each other — a constant cannot be read before it exists, and ArkType
 * evaluates a thunk immediately rather than deferring it.
 */
export type ArkRefStyle = "binding" | "member";

function reference(name: string, style: ArkRefStyle): string {
  return style === "member" ? jsLiteral(name) : `${name}Schema`;
}

export function schemaToArkType(schema: ParsedSchema, style: ArkRefStyle = "binding"): string {
  if (schema.type === "ref" && schema.refName) return reference(schema.refName, style);

  if (schema.type === "array") {
    /* Always a type object, so `.array()` has something to be called on. */
    const items = schema.items ? schemaToArkType(schema.items, style) : arkType("unknown");
    return style === "member" ? `[${items}, "[]"]` : `${items}.array()`;
  }

  if (schema.type === "enum" && schema.enum) {
    return wrap(enumExpression(schema.enum) ?? "string", style);
  }

  if (schema.type === "union" && schema.variants?.length) {
    /* ArkType joins type objects with a tuple, not with a string operator. */
    const variants = schema.variants.map((variant) => schemaToArkType(variant, style));
    if (variants.length === 1) return variants[0] as string;
    const joined = variants.join(', "|", ');
    return style === "member" ? `[${joined}]` : `type([${joined}])`;
  }

  if (schema.type === "object" && schema.properties) {
    const required = new Set(schema.required ?? []);
    const propLines: string[] = [];
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (!name) continue;
      const key = required.has(name) ? name : `${name}?`;
      propLines.push(`  ${jsLiteral(key)}: ${propToArkType(prop, style)}`);
    }
    if (propLines.length === 0) return arkType("Record<string, unknown>");
    const body = `{\n${propLines.join(",\n")},\n}`;
    return style === "member" ? body : `type(${body})`;
  }

  return wrap(arkExpression(schema.type), style);
}

export function propToArkType(prop: ParsedSchemaProperty, style: ArkRefStyle = "binding"): string {
  if (prop.refName) return reference(prop.refName, style);

  if (prop.enum) {
    const members = enumExpression(prop.enum) ?? arkExpression(prop.type, prop.format);
    return wrap(prop.nullable ? `${members} | null` : members, style);
  }

  if (prop.type === "array" && prop.items) {
    const items = schemaToArkType(prop.items, style);
    return style === "member" ? `[${items}, "[]"]` : `${items}.array()`;
  }
  if (prop.type === "object") return wrap("Record<string, unknown>", style);

  const base = arkExpression(prop.type, prop.format);
  return wrap(prop.nullable ? `${base} | null` : base, style);
}

export function primitiveToArkType(type: string, format?: string): string {
  return arkType(arkExpression(type, format));
}

/** Inside a module an expression is written bare; outside it needs the call. */
function wrap(expression: string, style: ArkRefStyle): string {
  return style === "member" ? jsLiteral(expression) : arkType(expression);
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
