/** The schema of an object's field `__proto__`, which zod checks apart, and whether the object requires it. */
export interface ProtoField {
  schema: string;
  required: boolean;
}

/**
 * The source of an object schema written through `_ownFields`.
 *
 * @param object - The object schema of its fields
 * @param proto - Its field `__proto__`, for zod, which checks none in an object
 * @returns The source
 * @example
 * ```ts
 * ownFieldsCall("z.looseObject({ id: z.string() })", { schema: "z.number()", required: true });
 * // → '_ownFields(z.looseObject({ id: z.string() }), z.number(), true)'
 * ```
 */
export function ownFieldsCall(object: string, proto?: ProtoField): string {
  if (proto === undefined) return `_ownFields(${object})`;
  return `_ownFields(${object}, ${proto.schema}${proto.required ? ", true" : ""})`;
}
