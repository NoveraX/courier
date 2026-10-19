/**
 * The schemas of an endpoint's variables that hold its parameters: beside a
 * body's fields, beside a body under a key of its own, or alone.
 */

import { isInheritedName } from "../parser/inherited-names";
import type { ParsedParameter } from "../parser/types";
import { arkProperty } from "./ark-property";
import { objectKey } from "./literals";
import { ownFieldsCall, type ProtoField } from "./own-fields-call";
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
 * @param owned - How the body's schema is written when its fields include a
 *   name every object inherits: through `_ownFields`, its own fields reached
 *   through `fields`, and for zod whether it has a field `__proto__`
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
  owned: OwnedBody | null = null,
): string {
  if (params.length === 0) return schemaExpr;
  const inherits = owned !== null || params.some((param) => isInheritedName(param.name));
  const base = owned === null ? schemaExpr : `${schemaExpr}.fields`;
  if (options.validation === "zod") {
    const { fields, proto } = zodFields(params);
    /* `.extend` belongs to an object schema; a body that is one of several
       shapes has to be intersected instead. */
    if (!isObject) return `z.intersection(${schemaExpr}, ${zodObject(fields, proto, inherits)})`;
    const extended = `${base}.extend({ ${fields} })`;
    const kept: ProtoField | undefined = owned?.proto
      ? { schema: `${schemaExpr}.proto`, required: owned.proto === "required" }
      : undefined;
    return inherits ? ownFieldsCall(extended, proto ?? kept) : extended;
  }
  const fields = params.map((param) => parameterField(param, options)).join(", ");
  if (options.validation === "valibot") {
    if (!isObject)
      return `v.intersect([${schemaExpr}, ${owning(`v.object({ ${fields} })`, inherits)}])`;
    return owning(`v.object({ ...${base}.entries, ${fields} })`, inherits);
  }
  if (options.validation === "arktype") {
    const extended = `${base}.and({ ${fields} })`;
    const kept: ProtoField | undefined = owned?.proto
      ? { schema: `${schemaExpr}.proto`, required: false }
      : undefined;
    return inherits ? ownFieldsCall(extended, arkProto(params) ?? kept) : extended;
  }
  return schemaExpr;
}

/** A body whose fields include a name every object inherits: whether zod checks a field `__proto__` of it apart. */
export interface OwnedBody {
  proto: "required" | "optional" | null;
}

/* A schema's constant, named and nothing more: what writing it calls no validation library for. */
const CONSTANT = /^[A-Za-z_$][\w$]*$/;

/**
 * Whether {@link extendSchemaWithParams} writes the validation library's
 * own name, rather than only methods of the schemas it names: extending an
 * object with parameters that are each a named schema —
 * `UserSchema.extend({ owner: OwnerSchema })` — calls none, so a file whose
 * every use is such imports nothing from it.
 *
 * @param params - The parameters the body is extended with
 * @param options - Generation options, read for the validation library
 * @param isObject - Whether the body's schema is an object that can be extended
 * @returns Whether the schema written calls the library
 * @example
 * ```ts
 * extensionCallsValidator([owner], { validation: "zod" }, true); // → false, owner being a named schema
 * ```
 */
export function extensionCallsValidator(
  params: readonly ParsedParameter[],
  options: GeneratorSettings,
  isObject: boolean,
): boolean {
  if (options.validation === "valibot" || (options.validation === "zod" && !isObject)) return true;
  if (options.validation !== "zod" && options.validation !== "arktype") return false;
  return params.some((param) => !CONSTANT.test(parameterValue(param, options)));
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
  const inherits = params.some((param) => isInheritedName(param.name));
  if (options.validation === "zod") {
    const { fields, proto } = zodFields(params);
    const body = optional ? `${bodyExpr}.optional()` : bodyExpr;
    const all = [...(fields === "" ? [] : [fields]), `${objectKey(key)}: ${body}`].join(", ");
    return zodObject(all, proto, inherits);
  }
  const fields = params.map((param) => parameterField(param, options));
  if (options.validation === "valibot") {
    const body = optional ? `v.optional(${bodyExpr})` : bodyExpr;
    return owning(
      `v.object({ ${[...fields, `${objectKey(key)}: ${body}`].join(", ")} })`,
      inherits,
    );
  }
  const object = `type({ ${[...fields, arkProperty(key, optional, bodyExpr)].join(", ")} })`;
  return inherits ? ownFieldsCall(object, arkProto(params)) : object;
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
  const inherits = params.some((param) => isInheritedName(param.name));
  if (options.validation === "zod") {
    const { fields, proto } = zodFields(params);
    return zodObject(fields, proto, inherits);
  }
  const fields = params.map((param) => parameterField(param, options)).join(", ");
  if (options.validation === "valibot") return owning(`v.object({ ${fields} })`, inherits);
  return inherits ? ownFieldsCall(`type({ ${fields} })`, arkProto(params)) : `type({ ${fields} })`;
}

/* ArkType's description of a parameter `__proto__`, which it leaves out of what it writes of the object. */
function arkProto(params: readonly ParsedParameter[]): ProtoField | undefined {
  const proto = params.find((param) => param.name === "__proto__");
  return proto && { schema: parameterValue(proto, ARK), required: false };
}

/* zod's fields of parameters, and the one named `__proto__` apart: an object of zod checks none. */
function zodFields(params: readonly ParsedParameter[]): { fields: string; proto?: ProtoField } {
  const proto = params.find((param) => param.name === "__proto__");
  const others = params.filter((param) => param !== proto);
  const fields = others.map((param) => parameterField(param, ZOD)).join(", ");
  if (proto === undefined) return { fields };
  const required = parameterProperty(proto).required;
  const value = parameterValue(proto, ZOD);
  return { fields, proto: { schema: required ? value : `${value}.optional()`, required } };
}

function zodObject(fields: string, proto: ProtoField | undefined, inherits: boolean): string {
  const object = `z.object({ ${fields} })`;
  return inherits ? ownFieldsCall(object, proto) : object;
}

function owning(object: string, inherits: boolean): string {
  return inherits ? ownFieldsCall(object) : object;
}

const ZOD: GeneratorSettings = { validation: "zod" };
const ARK: GeneratorSettings = { validation: "arktype" };

/**
 * One parameter as a field of an object schema. A format is not checked: a
 * parameter's format describes what the server expects, and refusing a call
 * the server would have answered helps nobody.
 */
function parameterField(param: ParsedParameter, options: GeneratorSettings): string {
  const optional = !parameterProperty(param).required;
  const value = parameterValue(param, options);
  if (options.validation === "zod") {
    return `${objectKey(param.name)}: ${value}${optional ? ".optional()" : ""}`;
  }
  if (options.validation === "valibot") {
    return `${objectKey(param.name)}: ${optional ? `v.optional(${value})` : value}`;
  }
  return arkProperty(param.name, optional, value);
}

/* A parameter's own schema, before it is made optional. */
function parameterValue(param: ParsedParameter, options: GeneratorSettings): string {
  const prop = parameterProperty(param);
  if (options.validation === "zod") return propToZod(prop);
  if (options.validation === "valibot") return propToValibot(prop);
  return propToArkType(prop);
}
