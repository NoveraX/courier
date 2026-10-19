/**
 * What a module of valibot schemas declares when an object of it has a
 * field named like a member every object inherits — `constructor`,
 * `toString`, `__proto__`: valibot read such a field the value lacked as
 * the member every object has, and refused it, and it leaves a field
 * `__proto__` out of what it gives. Every global it reads is read through
 * `globalThis`, and every type it names is valibot's or its own, so a
 * schema named `Object` or `Record` takes the place of none.
 */
export const VALIBOT_OWN_FIELDS = `/* An optional field named like a member TypeScript reads on every object takes that member's
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
 * is absent there, rather than the member every object has. A field
 * \`__proto__\` of its own, which valibot leaves out of what it gives, is put
 * back on the result as a field of its own.
 */
function _ownFields<TFields extends v.GenericSchema<object, object> & { entries: v.ObjectEntries }>(
  fields: TFields,
): v.GenericSchema<_OwnFieldsOf<v.InferInput<TFields>>, _OwnFieldsOf<v.InferOutput<TFields>>> & {
  fields: TFields;
};
function _ownFields(
  fields: v.GenericSchema<object, object> & { entries: v.ObjectEntries },
): v.GenericSchema & { fields: v.GenericSchema<object, object> & { entries: v.ObjectEntries } } {
  const schema = v.pipe(
    v.unknown(),
    v.rawTransform(({ dataset, addIssue, NEVER }) => {
      const input = dataset.value;
      const record = typeof input === "object" && input !== null && !globalThis.Array.isArray(input);
      const copy: { [key: string]: unknown } = globalThis.Object.create(null);
      if (record) for (const [key, value] of globalThis.Object.entries(input)) copy[key] = value;
      const checked = v.safeParse(fields, record ? copy : input);
      for (const issue of checked.issues ?? []) {
        addIssue({ message: issue.message, ...(issue.path && { path: issue.path }) });
      }
      if (!checked.success) return NEVER;
      const kept =
        record &&
        globalThis.Object.hasOwn(input, "__proto__") &&
        globalThis.Object.hasOwn(fields.entries, "__proto__");
      return kept
        ? { ...checked.output, ["__proto__"]: globalThis.Reflect.get(input, "__proto__") }
        : checked.output;
    }),
  );
  return globalThis.Object.assign(schema, { fields });
}
`;
