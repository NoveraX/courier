/**
 * What a module of ArkType schemas declares when an object of it has a
 * field named like a member every object inherits — `constructor`,
 * `toString`, `__proto__`: ArkType read such a field the value lacked as
 * the member every object has, and refused it. It takes its fields by
 * what it calls of them, so the file needs no more of ArkType than the
 * `type` it imports already — an update merges one import of a module.
 * Every global it reads is read through `globalThis`, and every type it
 * names is its own, so a schema named `Object` or `Record` takes the place
 * of none; it compiles with an ArkType that writes no JSON Schema, and then
 * describes nothing.
 */
export const ARKTYPE_OWN_FIELDS = `/* An optional field named like a member TypeScript reads on every object takes that member's
   type too, as the field's own type does: a value that leaves it out still has the member. A
   field is optional when one declared optional is assignable to it. Named with a leading
   underscore, as Studio names no binding or schema, so none can take its place. */
type _OwnFieldsOf<TValue> = {
  [TKey in keyof TValue]: TKey extends keyof globalThis.Object
    ? { [TOwn in TKey]?: TValue[TKey] } extends {
        [TOwn in keyof TValue as TOwn extends TKey ? TOwn : never]: TValue[TOwn];
      }
      ? TValue[TKey] | globalThis.Object[TKey]
      : TValue[TKey]
    : TValue[TKey];
};

/**
 * An object whose fields include a name every object inherits, checked on a
 * copy of the value's own fields with no prototype: a field the value lacks
 * is absent there, rather than the member every object has. The value is
 * given back as it is, a field \`__proto__\` of its own with it. It is described
 * as its fields are, a field \`__proto__\` — which ArkType leaves out of what it
 * writes — as \`proto\` is, and its check carries that description, so it is
 * written so inside another schema too.
 */
function _ownFields<
  TFields extends ((data: unknown) => unknown) & {
    readonly infer: object;
    readonly "~standard": object;
  },
>(fields: TFields, proto?: { readonly "~standard": object }) {
  type Described = { readonly [key: string]: unknown };
  type Converter = {
    readonly input: (options: { readonly target: string }) => Described;
    readonly output: (options: { readonly target: string }) => Described;
  };
  type Problem = { expected: string; actual: string; relativePath: (string | number | symbol)[] };
  const check = (
    value: object,
    ctx: { reject(problem: Problem): unknown },
  ): value is _OwnFieldsOf<TFields["infer"]> => {
    const copy: { [key: string]: unknown } = globalThis.Object.create(null);
    for (const [key, item] of globalThis.Object.entries(value)) copy[key] = item;
    const result = fields(copy);
    if (!(result instanceof type.errors)) return true;
    for (const error of result) {
      ctx.reject({ expected: error.expected, actual: error.actual, relativePath: [...error.path] });
    }
    return false;
  };
  const schema = type("object").narrow(check);
  const fieldsStandard: { readonly jsonSchema?: Converter } = fields["~standard"];
  const field: { readonly jsonSchema?: Converter } | undefined = proto?.["~standard"];
  const converter = fieldsStandard.jsonSchema;
  if (converter === undefined) return globalThis.Object.assign(schema, { fields, proto });
  const described =
    (side: "input" | "output") =>
    (options: { readonly target: string }): Described => {
      const base = converter[side](options);
      const written = field?.jsonSchema?.[side](options);
      if (written === undefined) return base;
      const { $schema: _dialect, ...property } = written;
      const properties: { [key: string]: unknown } =
        typeof base.properties === "object" && base.properties !== null ? { ...base.properties } : {};
      globalThis.Object.defineProperty(properties, "__proto__", {
        value: property,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      return { ...base, properties };
    };
  const jsonSchema = { input: described("input"), output: described("output") };
  const standard = { ...schema["~standard"], jsonSchema };
  globalThis.Object.defineProperty(schema, "~standard", { value: standard });
  globalThis.Object.assign(check, { "~standard": standard });
  return globalThis.Object.assign(schema, { fields, proto });
}
`;
