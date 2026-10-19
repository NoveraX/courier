/**
 * What a module of zod schemas declares when an object of it has a field
 * named like a member every object inherits — `constructor`, `toString`,
 * `__proto__`: zod read such a field the value lacked as the member every
 * object has, and refused it, and it checks no field `__proto__` at all.
 * Every global it reads is read through `globalThis`, and every type it
 * names is zod's or its own, so a schema named `Object` or `Record` takes
 * the place of none.
 */
export const ZOD_OWN_FIELDS = `/* An optional field named like a member TypeScript reads on every object takes that member's
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
 * reads \`undefined\` there, rather than the member every object has. A field
 * \`__proto__\`, which zod skips, is checked apart and kept on the result as a
 * field of its own. The object is described as its fields are.
 */
function _ownFields<TFields extends z.ZodType<object, object>, TProto extends z.ZodType>(
  fields: TFields,
  proto: TProto,
  required: true,
): z.ZodType<
  _OwnFieldsOf<z.output<TFields>> & { __proto__: z.output<TProto> },
  _OwnFieldsOf<z.input<TFields>> & { __proto__: z.input<TProto> }
> & { fields: TFields; proto: TProto };
function _ownFields<TFields extends z.ZodType<object, object>, TProto extends z.ZodType = z.ZodNever>(
  fields: TFields,
  proto?: TProto,
): z.ZodType<
  _OwnFieldsOf<z.output<TFields>> & { __proto__?: z.output<TProto> },
  _OwnFieldsOf<z.input<TFields>> & { __proto__?: z.input<TProto> }
> & { fields: TFields; proto: TProto | undefined };
function _ownFields(
  fields: z.ZodType<object, object>,
  proto?: z.ZodType,
  _required?: true,
): z.ZodType & { fields: z.ZodType<object, object>; proto: z.ZodType | undefined } {
  const ownCopy = (value: unknown): unknown => {
    if (typeof value !== "object" || value === null || globalThis.Array.isArray(value)) return value;
    const copy: { [key: string]: unknown } = globalThis.Object.create(null);
    for (const [key, item] of globalThis.Object.entries(value)) if (key !== "__proto__") copy[key] = item;
    return copy;
  };
  /* Without a field \`__proto__\`, the copy is checked and described as the fields are, wherever it sits. */
  if (proto === undefined) return globalThis.Object.assign(z.preprocess(ownCopy, fields), { fields, proto });
  const schema = z.custom<object>().transform((input, ctx): object => {
    const checked = fields.safeParse(ownCopy(input));
    const own = typeof input === "object" && input !== null && globalThis.Object.hasOwn(input, "__proto__");
    const given = proto.safeParse(own ? globalThis.Reflect.get(input, "__proto__") : undefined);
    const issues = [
      ...(checked.error?.issues ?? []),
      ...(given.error?.issues ?? []).map((issue) => ({ ...issue, path: ["__proto__", ...issue.path] })),
    ];
    for (const issue of issues) {
      ctx.addIssue({ code: "custom", message: issue.message, path: issue.path, input });
    }
    if (!checked.success || !given.success) return z.NEVER;
    return own ? { ...checked.data, ["__proto__"]: given.data } : checked.data;
  });
  /* The fields' description, with \`__proto__\` among its properties as a key of its own. */
  const withProto = (base: { [key: string]: unknown }, described: { [key: string]: unknown }) => {
    const { $schema: _dialect, ...field } = described;
    const properties: { [key: string]: unknown } =
      typeof base.properties === "object" && base.properties !== null ? { ...base.properties } : {};
    globalThis.Object.defineProperty(properties, "__proto__", {
      value: field,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    const required: unknown[] = globalThis.Array.isArray(base.required) ? base.required : [];
    const taken = proto.safeParse(undefined).success ? required : [...required, "__proto__"];
    return { ...base, properties, required: taken };
  };
  const converter = fields["~standard"].jsonSchema;
  const field = proto["~standard"].jsonSchema;
  const jsonSchema: typeof converter = {
    input: (options) => withProto(converter.input(options), field.input(options)),
    output: (options) => withProto(converter.output(options), field.output(options)),
  };
  globalThis.Object.defineProperty(schema, "~standard", { value: { ...schema["~standard"], jsonSchema } });
  return globalThis.Object.assign(schema, { fields, proto });
}
`;
