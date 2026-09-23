/**
 * TypeScript type generation from parsed schemas.
 */

import type { ParsedSchema } from "../parser/types";
import { EXACT_OPTIONAL, propertyType, schemaToTsType, type TypeStyle } from "./inline-types";
import { jsdocText } from "./jsdoc-text";
import { objectKey } from "./literals";
import type { GenerateOptions } from "./types";

/**
 * The type written beside a schema, in the style its validator infers.
 *
 * @param options - Generator options
 * @returns How optional properties are written
 */
export function typeStyleFor(options: GenerateOptions): TypeStyle {
  const loose = options.validation === "zod" || options.validation === "valibot";
  return { undefinedWhenOptional: options.generateSchemas === true && loose };
}

export function schemaToInterface(schema: ParsedSchema, style = EXACT_OPTIONAL): string {
  /* A schema that is not an object still has a type — a union of alternatives,
     an array, an enum — and answering `{}` described it as an empty one. */
  if (schema.type !== "object" || !schema.properties) return `${schemaToTsType(schema, style)};`;

  const required = new Set(schema.required ?? []);
  const lines: string[] = [];
  for (const [name, prop] of Object.entries(schema.properties)) {
    if (!name) continue;
    if (prop.description) lines.push(`  /** ${jsdocText(prop.description)} */`);
    lines.push(`  ${objectKey(name)}${propertyType(prop, !required.has(name), style)};`);
  }

  return `{\n${lines.join("\n")}\n};`;
}
