import { endpointVariant, variant } from "./direction-variant";
import type { ParsedSchema, ParsedSpec } from "./types";

/**
 * Split each schema whose request and answer differ into the two. A readOnly
 * field is one the server sends and a writeOnly one the client sends, so one
 * type serving both had to leave each optional: the id an answer always
 * carries, the password a request always needs. A schema holding such a
 * field, itself or through a schema it refers to, is now read as the answer
 * — its writeOnly fields gone, its readOnly ones as required as declared —
 * and one a request sends gains an input twin, `UserInput`, the other way
 * round. Request bodies and parameters refer to the twins.
 *
 * @param spec - The parsed specification, its properties carrying their direction
 * @returns The specification with its answers and requests typed apart
 *
 * @example
 * ```ts
 * splitDirections(spec).schemas.UserInput?.properties; // { email, password } — no id
 * ```
 */
export function splitDirections(spec: ParsedSpec): ParsedSpec {
  /* A body or an answer written inline is split even where no named schema is. */
  const directed = directedSchemas(spec.schemas);
  const inputs = inputNames(spec, directed);
  const schemas: Record<string, ParsedSchema> = {};
  for (const [name, schema] of Object.entries(spec.schemas)) {
    schemas[name] = directed.has(name) ? variant(schema, "read", inputs) : schema;
  }
  for (const [name, input] of inputs) {
    const source = spec.schemas[name];
    if (source) schemas[input] = { ...variant(source, "write", inputs), name: input };
  }
  const groups = spec.groups.map((group) => ({
    ...group,
    endpoints: group.endpoints.map((ep) => endpointVariant(ep, inputs)),
  }));
  return { ...spec, schemas, groups };
}

/* The schemas with a directed field, themselves or through a reference. */
function directedSchemas(schemas: Readonly<Record<string, ParsedSchema>>): Set<string> {
  const directed = new Set<string>();
  const refers = new Map<string, Set<string>>();
  for (const [name, schema] of Object.entries(schemas)) {
    const refs = new Set<string>();
    if (walk(schema, refs)) directed.add(name);
    refers.set(name, refs);
  }
  for (let grown = true; grown; ) {
    grown = false;
    for (const [name, refs] of refers) {
      if (directed.has(name) || ![...refs].some((ref) => directed.has(ref))) continue;
      directed.add(name);
      grown = true;
    }
  }
  return directed;
}

/* The input twin's name of each directed schema a request sends. */
function inputNames(spec: ParsedSpec, directed: ReadonlySet<string>): Map<string, string> {
  const sent = new Set<string>();
  const queue: string[] = [];
  const visit = (schema: ParsedSchema): void => {
    const refs = new Set<string>();
    walk(schema, refs);
    for (const ref of refs) if (!sent.has(ref) && sent.add(ref)) queue.push(ref);
  };
  for (const ep of spec.groups.flatMap((group) => group.endpoints)) {
    if (ep.requestBody) visit(ep.requestBody);
    for (const param of ep.parameters)
      for (const part of [param.schema, param.items]) if (part) visit(part);
  }
  for (let name = queue.pop(); name !== undefined; name = queue.pop()) {
    const schema = spec.schemas[name];
    if (schema) visit(schema);
  }
  const taken = new Set(Object.keys(spec.schemas));
  const names = new Map<string, string>();
  for (const name of [...sent].filter((ref) => directed.has(ref)).sort()) {
    let input = `${name}Input`;
    for (let n = 2; taken.has(input); n += 1) input = `${name}Input${n}`;
    taken.add(input);
    names.set(name, input);
  }
  return names;
}

/* Whether the schema has a directed field, not following references; the
   references it makes are gathered on the way. */
function walk(schema: ParsedSchema, refs: Set<string>): boolean {
  if (schema.refName) refs.add(schema.refName);
  let directed = false;
  for (const prop of Object.values(schema.properties ?? {})) {
    if (prop.direction !== undefined) directed = true;
    if (prop.refName) refs.add(prop.refName);
    for (const part of [prop.items, prop.shape, prop.valueType])
      if (part && walk(part, refs)) directed = true;
  }
  for (const part of [schema.items, schema.valueType, ...(schema.variants ?? [])]) {
    if (part && walk(part, refs)) directed = true;
  }
  return directed;
}
