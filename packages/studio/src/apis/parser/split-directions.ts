import { ownValue } from "../own-value";
import { endpointVariant, variant } from "./direction-variant";
import { schemaTraits, withTrait } from "./schema-traits";
import { schemaUsage } from "./schema-usage";
import type { ParsedSchema, ParsedSpec } from "./types";

/**
 * Type what a request sends apart from what an answer carries.
 *
 * A readOnly field is one the server sends and a writeOnly one the client
 * sends, so one type serving both would have to leave each optional: the id
 * an answer always carries, the password a request always needs. A schema
 * holding such a field, itself or through a schema it refers to, is read as
 * the answer — its writeOnly fields gone, its readOnly ones as required as
 * declared — and one a request sends gains an input twin, `UserInput`, the
 * other way round.
 *
 * Constraints — lengths, bounds, patterns — are checked on what a request
 * sends and never on what an answer carries: a validator that refuses what
 * the API really sends is worse than none. A schema only answers carry
 * loses them, one only requests send keeps them where it is, and one both
 * send and carry — itself or through a schema it refers to — is split as a
 * directed one is: the answer without them, the input twin with them.
 * Request bodies and parameters refer to the twins.
 *
 * @param spec - The parsed specification, its properties carrying their direction and constraints
 * @returns The specification with its answers and requests typed apart
 *
 * @example
 * ```ts
 * splitDirections(spec).schemas.UserInput?.properties; // { email, password } — no id
 * ```
 */
export function splitDirections(spec: ParsedSpec): ParsedSpec {
  const traits = new Map(
    Object.entries(spec.schemas).map(([name, schema]) => [name, schemaTraits(schema)]),
  );
  const directed = withTrait(traits, (own) => own.directed);
  const constrained = withTrait(traits, (own) => own.constrained);
  const { sent, answered } = schemaUsage(spec);
  const split = new Set(
    [...sent].filter((name) => directed.has(name) || (constrained.has(name) && answered.has(name))),
  );
  const inputs = inputNames(spec.schemas, split);
  const schemas: Record<string, ParsedSchema> = {};
  for (const [name, schema] of Object.entries(spec.schemas)) {
    if (!directed.has(name) && !constrained.has(name)) {
      schemas[name] = schema;
      continue;
    }
    const sentOnly = sent.has(name) && !answered.has(name) && !split.has(name);
    schemas[name] = variant(schema, sentOnly ? "write" : "read", inputs);
  }
  for (const [name, input] of inputs) {
    const source = ownValue(spec.schemas, name);
    if (source) schemas[input] = { ...variant(source, "write", inputs), name: input };
  }
  const groups = spec.groups.map((group) => ({
    ...group,
    endpoints: group.endpoints.map((ep) => endpointVariant(ep, inputs)),
  }));
  return { ...spec, schemas, groups };
}

/* The input twin's name of each schema split, clear of every name taken. */
function inputNames(
  schemas: Readonly<Record<string, ParsedSchema>>,
  split: ReadonlySet<string>,
): Map<string, string> {
  const taken = new Set(Object.keys(schemas));
  const names = new Map<string, string>();
  for (const name of [...split].sort()) {
    let input = `${name}Input`;
    for (let n = 2; taken.has(input); n += 1) input = `${name}Input${n}`;
    taken.add(input);
    names.set(name, input);
  }
  return names;
}
