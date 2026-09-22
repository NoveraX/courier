/**
 * Valibot schema generation from parsed schemas.
 */

import type { ParsedSchema, ParsedSchemaProperty } from "../parser/types";
import { jsLiteral, objectKey, type SpecValue } from "./literals";

export function schemaToValibot(schema: ParsedSchema): string {
  if (schema.type === "ref" && schema.refName) return `${schema.refName}Schema`;

  if (schema.type === "array") {
    const items = schema.items ? schemaToValibot(schema.items) : "v.unknown()";
    return `v.array(${items})`;
  }

  if (schema.type === "enum" && schema.enum) return valibotEnum(schema.enum);

  if (schema.type === "object" && schema.properties) {
    const required = new Set(schema.required ?? []);
    const propLines: string[] = [];
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (!name) continue;
      let valType = propToValibot(prop);
      if (!required.has(name)) valType = `v.optional(${valType})`;
      if (prop.nullable) valType = `v.nullable(${valType})`;
      propLines.push(`  ${objectKey(name)}: ${valType}`);
    }
    if (propLines.length === 0) return "v.record(v.string(), v.unknown())";
    return `v.object({\n${propLines.join(",\n")},\n})`;
  }

  return primitiveToValibot(schema.type);
}

export function propToValibot(prop: ParsedSchemaProperty): string {
  if (prop.refName) return `${prop.refName}Schema`;
  /* Without this the members were thrown away and the property became a plain
     string, which then failed the `satisfies` assertion written beside it. */
  if (prop.enum) return valibotEnum(prop.enum);
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

/**
 * Render an enum: `v.picklist` reads string members, anything else is a union
 * of literals.
 *
 * @param values - Members as the specification listed them
 * @returns A valibot expression, or `v.unknown()` when nothing is usable
 */
export function valibotEnum(values: readonly (SpecValue | null | undefined)[]): string {
  const usable = values.filter(
    (value): value is SpecValue => value !== null && value !== undefined,
  );
  if (usable.length === 0) return "v.unknown()";

  if (usable.every((value) => typeof value === "string")) {
    return `v.picklist([${usable.map((value) => jsLiteral(value)).join(", ")}])`;
  }

  const literals = usable.map((value) => `v.literal(${jsLiteral(value)})`);
  return literals.length === 1 ? (literals[0] as string) : `v.union([${literals.join(", ")}])`;
}
