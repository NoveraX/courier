/**
 * Zod schema generation from parsed schemas.
 */

import type { ParsedSchema, ParsedSchemaProperty } from "../parser/types";
import { zodEnum } from "./enum-literals";
import { objectKey } from "./literals";
import { withZodChecks } from "./zod-checks";

export function schemaToZod(schema: ParsedSchema): string {
  if (schema.type === "ref" && schema.refName) return `${schema.refName}Schema`;

  if (schema.type === "array") {
    const items = schema.items ? schemaToZod(schema.items) : "z.unknown()";
    return withZodChecks(`z.array(${items})`, schema.constraints);
  }

  if (schema.type === "enum" && schema.enum) {
    return zodEnum(schema.enum);
  }

  if (schema.type === "union" && schema.variants?.length) {
    const variants = schema.variants.map((variant) => schemaToZod(variant));
    return variants.length === 1 ? (variants[0] as string) : `z.union([${variants.join(", ")}])`;
  }

  if (schema.type === "object" && schema.properties) {
    const required = new Set(schema.required ?? []);
    const propLines: string[] = [];
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (!name) continue;
      let zodType = propToZod(prop);
      if (!required.has(name)) zodType += ".optional()";
      if (prop.nullable) zodType += ".nullable()";
      const key = objectKey(name);
      propLines.push(`  ${key}: ${zodType}`);
    }
    if (propLines.length === 0) {
      return schema.valueType
        ? `z.record(z.string(), ${schemaToZod(schema.valueType)})`
        : "z.record(z.string(), z.unknown())";
    }
    /* An answer keeps the fields its specification does not declare, as
       ArkType's objects do: a strict object dropped whatever an API added
       after its specification was written. */
    return `z.looseObject({\n${propLines.join(",\n")},\n})`;
  }

  return withZodChecks(primitiveToZod(schema.type), schema.constraints);
}

export function propToZod(prop: ParsedSchemaProperty): string {
  if (prop.refName) return `${prop.refName}Schema`;
  if (prop.enum) {
    return zodEnum(prop.enum);
  }
  if (prop.type === "array" && prop.items) {
    return withZodChecks(`z.array(${schemaToZod(prop.items)})`, prop.constraints);
  }
  if (prop.shape) return schemaToZod(prop.shape);
  if (prop.valueType) return `z.record(z.string(), ${schemaToZod(prop.valueType)})`;
  if (prop.type === "object") return "z.record(z.string(), z.unknown())";
  return withZodChecks(primitiveToZod(prop.type, prop.format), prop.constraints);
}

export function primitiveToZod(type: string, format?: string): string {
  /* An address is not checked either: an API hides one as an empty string —
     Gitea's `owner.email` — and a checked address refused the whole answer. */
  if (type === "string" && format === "email") return "z.string()";
  /* RFC 3339 allows a zone offset, and 18 of the 67 `date-time` examples the
     specifications themselves give carry one; the default form rejected
     every single one of them. */
  if (type === "string" && format === "date-time") return "z.iso.datetime({ offset: true })";
  /* `format: uri` is used loosely — three of the 162 examples in the sample
     are not absolute URIs at all. A validator that rejects what the API
     really returns is worse than one that does not check. */
  if (type === "string" && format === "uri") return "z.string()";
  if (type === "string" && format === "uuid") return "z.uuid()";
  if (type === "string") return "z.string()";
  if (type === "number" || type === "integer") return "z.number()";
  if (type === "boolean") return "z.boolean()";
  if (type === "null") return "z.null()";
  return "z.unknown()";
}
