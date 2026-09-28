/**
 * Schema utility functions: validation helpers, satisfies expressions, ref helpers.
 */

import type { ParsedParameter, ParsedSchema } from "../parser/types";
import { jsLiteral, objectKey } from "./literals";
import { parameterProperty } from "./parameter-property";
import type { GeneratorSettings } from "./types";
import { propToArkType, schemaToArkType } from "./validation-arktype";
import { propToValibot, schemaToValibot } from "./validation-valibot";
import { propToZod, schemaToZod } from "./validation-zod";

/** Generate `satisfies ZodType<T>` / `satisfies GenericSchema<...>` expression for type-safe sync */
export function satisfiesExpr(typeName: string, options: GeneratorSettings): string {
  if (options.validation === "zod") return ` satisfies z.ZodType<${typeName}>`;
  if (options.validation === "valibot") return ` satisfies v.GenericSchema<any, ${typeName}>`;
  if (options.validation === "arktype") return ` satisfies { infer: ${typeName} }`;
  return "";
}

/**
 * Write a schema whose definition refers back to itself.
 *
 * A value cannot read a constant declared below it, so a schema on a
 * reference cycle is wrapped in the validator's `lazy` and given an explicit
 * annotation — without one the compiler cannot infer a type that mentions
 * itself. Stripe's treasury objects need this in both directions.
 *
 * @param name - Schema name, without the `Schema` suffix
 * @param body - The validator expression as it would be written eagerly
 * @param typeName - Type the schema produces, when one is being generated
 * @param options - Generation options, read for the validation library
 * @returns The full `export const` line, or `undefined` when the library has
 *   no lazy form and the eager declaration must be used instead
 */
export function lazyDeclaration(
  name: string,
  body: string,
  typeName: string | undefined,
  options: GeneratorSettings,
): string | undefined {
  if (options.validation === "zod") {
    const annotation = typeName ? `z.ZodType<${typeName}>` : "z.ZodType<unknown>";
    return `export const ${name}Schema: ${annotation} = z.lazy(() => ${body});`;
  }
  if (options.validation === "valibot") {
    const annotation = typeName ? `v.GenericSchema<any, ${typeName}>` : "v.GenericSchema";
    return `export const ${name}Schema: ${annotation} = v.lazy(() => ${body});`;
  }
  return undefined;
}

export function getSchemaRefName(schema: ParsedSchema | null): string | null {
  if (!schema) return null;
  if (schema.type === "ref") return schema.refName ?? null;
  if (schema.type === "array" && schema.items?.type === "ref") return schema.items.refName ?? null;
  return null;
}

export function schemaToValidation(schema: ParsedSchema, options: GeneratorSettings): string {
  if (options.validation === "zod") return schemaToZod(schema);
  if (options.validation === "valibot") return schemaToValibot(schema);
  if (options.validation === "arktype") return schemaToArkType(schema);
  return "unknown";
}

/**
 * Extend a body's schema with the parameters that sit beside its fields.
 *
 * Each parameter is validated as the specification types it. Written as a
 * string whatever it was, an integer path parameter refused the number its
 * own specification asks for — and the same parameter of the endpoint
 * beside it, which has no body, took a number.
 *
 * @param schemaExpr - The body's schema
 * @param params - The parameters to add
 * @param options - Generation options, read for the validation library
 * @param isObject - Whether the body's schema is an object that can be extended
 * @returns The schema of the variables
 * @example
 * ```ts
 * extendSchemaWithParams("ItemSchema", [itemId], { validation: "zod" }); // "ItemSchema.extend({ item_id: z.number() })"
 * ```
 */
export function extendSchemaWithParams(
  schemaExpr: string,
  params: readonly ParsedParameter[],
  options: GeneratorSettings,
  isObject = true,
): string {
  if (params.length === 0) return schemaExpr;
  const fields = params.map((param) => parameterField(param, options)).join(", ");

  if (options.validation === "zod") {
    /* `.extend` belongs to an object schema; a body that is one of several
       shapes has to be intersected instead. */
    return isObject
      ? `${schemaExpr}.extend({ ${fields} })`
      : `z.intersection(${schemaExpr}, z.object({ ${fields} }))`;
  }
  if (options.validation === "valibot") {
    return isObject
      ? `v.object({ ...${schemaExpr}.entries, ${fields} })`
      : `v.intersect([${schemaExpr}, v.object({ ${fields} })])`;
  }
  if (options.validation === "arktype") return `${schemaExpr}.and({ ${fields} })`;
  return schemaExpr;
}

/**
 * One parameter as a field of an object schema. A format is not checked: a
 * parameter's format describes what the server expects, and refusing a call
 * the server would have answered helps nobody.
 */
function parameterField(param: ParsedParameter, options: GeneratorSettings): string {
  const prop = parameterProperty(param);
  const optional = !prop.required;
  if (options.validation === "zod") {
    return `${objectKey(param.name)}: ${propToZod(prop)}${optional ? ".optional()" : ""}`;
  }
  if (options.validation === "valibot") {
    const valibot = propToValibot(prop);
    return `${objectKey(param.name)}: ${optional ? `v.optional(${valibot})` : valibot}`;
  }
  return `${jsLiteral(optional ? `${param.name}?` : param.name)}: ${propToArkType(prop)}`;
}
