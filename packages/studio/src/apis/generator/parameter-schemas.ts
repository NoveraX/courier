/**
 * The schemas of an endpoint's variables that hold its parameters: beside a
 * body's fields, beside a body under a key of its own, or alone.
 */

import type { ParsedParameter } from "../parser/types";
import { arkProperty } from "./ark-property";
import { objectKey } from "./literals";
import { parameterProperty } from "./parameter-property";
import type { GeneratorSettings } from "./types";
import { propToArkType } from "./validation-arktype";
import { propToValibot } from "./validation-valibot";
import { propToZod } from "./validation-zod";

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
 * The schema of variables holding the parameters and, under a key of its
 * own, a body that is not a set of fields: a list, a scalar.
 *
 * @param bodyExpr - The body's schema
 * @param params - The parameters beside it
 * @param key - The key the body takes
 * @param options - Generation options, read for the validation library
 * @returns The schema of the variables
 * @example
 * ```ts
 * objectWithBody("z.array(TagSchema)", [itemId], "body", { validation: "zod" });
 * // "z.object({ item_id: z.number(), body: z.array(TagSchema) })"
 * ```
 */
export function objectWithBody(
  bodyExpr: string,
  params: readonly ParsedParameter[],
  key: string,
  options: GeneratorSettings,
  optional = false,
): string {
  const fields = params.map((param) => parameterField(param, options));
  if (options.validation === "zod") {
    const body = optional ? `${bodyExpr}.optional()` : bodyExpr;
    return `z.object({ ${[...fields, `${objectKey(key)}: ${body}`].join(", ")} })`;
  }
  if (options.validation === "valibot") {
    const body = optional ? `v.optional(${bodyExpr})` : bodyExpr;
    return `v.object({ ${[...fields, `${objectKey(key)}: ${body}`].join(", ")} })`;
  }
  return `type({ ${[...fields, arkProperty(key, optional, bodyExpr)].join(", ")} })`;
}

/**
 * A schema that also takes `undefined`: a body the operation does not
 * require, which a call may leave out.
 *
 * @param expr - The schema
 * @param options - Generation options, read for the validation library
 * @returns The schema taking `undefined` too
 * @example
 * ```ts
 * optionalSchema("z.array(TagSchema)", { validation: "zod" }); // "z.optional(z.array(TagSchema))"
 * ```
 */
export function optionalSchema(expr: string, options: GeneratorSettings): string {
  if (options.validation === "zod") return `z.optional(${expr})`;
  if (options.validation === "valibot") return `v.optional(${expr})`;
  return `type([${expr}, "|", "undefined"])`;
}

/**
 * The schema of variables that are parameters alone, for an endpoint with
 * no body whose parameters a schema has to check.
 *
 * @param params - The parameters
 * @param options - Generation options, read for the validation library
 * @returns The schema of the variables
 * @example
 * ```ts
 * parametersSchema([limit], { validation: "zod" }); // "z.object({ limit: z.number().int().max(100).optional() })"
 * ```
 */
export function parametersSchema(
  params: readonly ParsedParameter[],
  options: GeneratorSettings,
): string {
  const fields = params.map((param) => parameterField(param, options)).join(", ");
  if (options.validation === "zod") return `z.object({ ${fields} })`;
  if (options.validation === "valibot") return `v.object({ ${fields} })`;
  return `type({ ${fields} })`;
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
  return arkProperty(param.name, optional, propToArkType(prop));
}
