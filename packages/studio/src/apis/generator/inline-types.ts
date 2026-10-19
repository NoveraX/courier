/**
 * Converts ParsedSchema to inline TypeScript type strings.
 */

import { isObjectMember } from "../parser/object-members";
import type { ParsedSchema, ParsedSchemaProperty } from "../parser/types";
import { typeUnion } from "./enum-literals";
import { jsLiteral, typeKey } from "./literals";

/** How an optional property is written. */
export interface TypeStyle {
  /**
   * Write `?: T | undefined` rather than `?: T`. zod and valibot accept an
   * explicit `undefined` for an optional key and infer the type that way;
   * under `exactOptionalPropertyTypes` a written type that says otherwise
   * does not match its own schema.
   */
  undefinedWhenOptional: boolean;
  /**
   * How a reference to a named schema is written. A schemas file names
   * its siblings; an endpoint file names only what the schemas file it
   * imports from declares, and writes `unknown` for anything else.
   */
  reference?: (name: string) => string;
}

/** `?: T` — what ArkType infers, and the plain TypeScript form. */
export const EXACT_OPTIONAL: TypeStyle = { undefinedWhenOptional: false };

function referenceIn(style: TypeStyle, name: string): string {
  return style.reference ? style.reference(name) : name;
}

/** Convert a ParsedSchema to an inline TypeScript type string */
export function schemaToTsType(schema: ParsedSchema, style = EXACT_OPTIONAL): string {
  if (schema.type === "ref" && schema.refName) return referenceIn(style, schema.refName);
  if (schema.type === "array") {
    if (!schema.items) return "unknown[]";
    const inner = schemaToTsType(schema.items, style);
    return inner.includes("|") ? `(${inner})[]` : `${inner}[]`;
  }
  if (schema.type === "enum" && schema.enum) {
    return typeUnion(schema.enum);
  }
  if (schema.type === "union" && schema.variants?.length) {
    return schema.variants.map((variant) => schemaToTsType(variant, style)).join(" | ");
  }
  if (schema.type === "object" && schema.properties) {
    return objectToTsType(schema, style);
  }
  if (schema.valueType) return mapOf(schemaToTsType(schema.valueType, style));
  return primitiveToTsType(schema.type);
}

/**
 * A map of values of one type. Written as an index signature: a type alias
 * may refer to itself inside one — a JSON value is a map of JSON values —
 * where inside `Record<string, …>` it circularly references itself.
 */
function mapOf(values: string): string {
  return `{ [key: string]: ${values} }`;
}

function objectToTsType(schema: ParsedSchema, style: TypeStyle): string {
  const required = new Set(schema.required ?? []);
  const props: string[] = [];
  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    if (!name) continue;
    props.push(fieldType(name, prop, !required.has(name), style));
  }
  if (props.length > 0) return `{ ${props.join("; ")} }`;
  /* No property of its own: a map, typed by its values when it says what
     they are — an inventory of counts was typed as holding anything. */
  return mapOf(schema.valueType ? schemaToTsType(schema.valueType, style) : "unknown");
}

/**
 * The part of a property declaration after its key: `?: T | null`.
 *
 * @param prop - The property
 * @param optional - Whether the key may be absent
 * @param style - How an optional property is written
 * @returns The mark, the colon and the type
 */
/**
 * A field of an object type: its key, whether it may be left out, and its
 * type. An optional field named like a member TypeScript reads on every
 * object — `constructor`, `toString` — takes that member's type too: an
 * object without the field has the member, so the type took no object
 * that left the field out, and reading the field of one gives the member.
 *
 * @param name - The field's name, as the specification writes it
 * @param prop - The field
 * @param optional - Whether it may be left out
 * @param style - How optional fields are written
 * @returns The field, `key?: type`
 * @example
 * ```ts
 * fieldType("constructor", { type: "string", required: false }, true, EXACT_OPTIONAL);
 * // → 'constructor?: string | globalThis.Object["constructor"]'
 * ```
 */
export function fieldType(
  name: string,
  prop: ParsedSchemaProperty,
  optional: boolean,
  style: TypeStyle,
): string {
  const member = optional && isObjectMember(name) ? ` | globalThis.Object[${jsLiteral(name)}]` : "";
  return `${typeKey(name)}${propertyType(prop, optional, style)}${member}`;
}

export function propertyType(
  prop: ParsedSchemaProperty,
  optional: boolean,
  style: TypeStyle,
): string {
  const nullable = prop.nullable ? " | null" : "";
  const absent = optional && style.undefinedWhenOptional ? " | undefined" : "";
  return `${optional ? "?" : ""}: ${propToTsType(prop, style)}${nullable}${absent}`;
}

export function propToTsType(prop: ParsedSchemaProperty, style = EXACT_OPTIONAL): string {
  if (prop.refName) return referenceIn(style, prop.refName);
  if (prop.shape) return schemaToTsType(prop.shape, style);
  if (prop.valueType) return mapOf(schemaToTsType(prop.valueType, style));
  if (prop.enum) {
    return typeUnion(prop.enum);
  }
  if (prop.type === "array" && prop.items) {
    const inner = schemaToTsType(prop.items, style);
    return inner.includes("|") ? `(${inner})[]` : `${inner}[]`;
  }
  /* Not `Record<…>`: a schema the specification calls Record would take its place. */
  if (prop.type === "object") return "{ [key: string]: unknown }";
  return primitiveToTsType(prop.type);
}

function primitiveToTsType(type: string): string {
  if (type === "integer") return "number";
  if (["string", "number", "boolean", "null"].includes(type)) return type;
  return "unknown";
}
