import type { ParsedEndpoint, ParsedParameter, ParsedSchema, ParsedSchemaProperty } from "./types";

type Direction = "read" | "write";

/**
 * A schema as it travels one way: the fields travelling the other way gone,
 * each directed field as required as declared for its way, and — for a
 * request — every reference to a split schema turned to its input twin.
 *
 * @param schema - The schema, its properties carrying their direction
 * @param to - The way it travels: `read` for an answer, `write` for a request
 * @param inputs - The input twin's name of each split schema a request sends
 * @returns The schema for that way, its properties no longer directed
 *
 * @example
 * ```ts
 * variant(user, "write", new Map([["User", "UserInput"]])).properties; // { email, password }
 * ```
 */
export function variant(
  schema: ParsedSchema,
  to: Direction,
  inputs: ReadonlyMap<string, string>,
): ParsedSchema {
  return {
    ...schema,
    ...(schema.refName && { refName: renamed(schema.refName, to, inputs) }),
    ...(schema.properties && fieldsVariant(schema.properties, schema.required, to, inputs)),
    ...(schema.items && { items: variant(schema.items, to, inputs) }),
    ...(schema.valueType && { valueType: variant(schema.valueType, to, inputs) }),
    ...(schema.variants && { variants: schema.variants.map((part) => variant(part, to, inputs)) }),
  };
}

/* The fields travelling in one direction: the others' gone, each with its requiredness there. */
function fieldsVariant(
  fields: Readonly<Record<string, ParsedSchemaProperty>>,
  declared: readonly string[] | undefined,
  to: Direction,
  inputs: ReadonlyMap<string, string>,
): Pick<ParsedSchema, "properties" | "required"> {
  const properties: Record<string, ParsedSchemaProperty> = {};
  const required = new Set(declared ?? []);
  for (const [name, prop] of Object.entries(fields)) {
    if (prop.direction !== undefined && prop.direction !== to) continue;
    properties[name] = propertyVariant(prop, to, inputs);
    if (properties[name]?.required) required.add(name);
  }
  return { properties, required: [...required] };
}

function propertyVariant(
  prop: ParsedSchemaProperty,
  to: Direction,
  inputs: ReadonlyMap<string, string>,
): ParsedSchemaProperty {
  const { direction, requiredInDirection, ...rest } = prop;
  return {
    ...rest,
    required: direction === to ? requiredInDirection === true : rest.required,
    ...(rest.refName && { refName: renamed(rest.refName, to, inputs) }),
    ...(rest.items && { items: variant(rest.items, to, inputs) }),
    ...(rest.shape && { shape: variant(rest.shape, to, inputs) }),
    ...(rest.valueType && { valueType: variant(rest.valueType, to, inputs) }),
  };
}

function renamed(ref: string, to: Direction, inputs: ReadonlyMap<string, string>): string {
  return to === "write" ? (inputs.get(ref) ?? ref) : ref;
}

/**
 * An endpoint with its request typed as sent and its answer as read.
 *
 * @param ep - The endpoint
 * @param inputs - The input twin's name of each split schema a request sends
 * @returns The endpoint, its body and parameters written, its answer read
 *
 * @example
 * ```ts
 * endpointVariant(createUser, inputs).requestBody?.refName; // "UserInput"
 * ```
 */
export function endpointVariant(
  ep: ParsedEndpoint,
  inputs: ReadonlyMap<string, string>,
): ParsedEndpoint {
  return {
    ...ep,
    requestBody: ep.requestBody && variant(ep.requestBody, "write", inputs),
    responseSchema: ep.responseSchema && variant(ep.responseSchema, "read", inputs),
    parameters: ep.parameters.map((param) => parameterVariant(param, inputs)),
  };
}

function parameterVariant(
  param: ParsedParameter,
  inputs: ReadonlyMap<string, string>,
): ParsedParameter {
  return {
    ...param,
    ...(param.schema && { schema: variant(param.schema, "write", inputs) }),
    ...(param.items && { items: variant(param.items, "write", inputs) }),
  };
}
