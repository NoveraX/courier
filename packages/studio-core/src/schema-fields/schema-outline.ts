/** A value an enum of an outline allows: one JSON writes as it is. */
export type OutlineValue = string | number | boolean | null;

/** A field of an object an outline describes. */
export interface OutlineField {
  name: string;
  /**
   * The object is refused without it: the field has no default or fallback,
   * and its schema refuses `undefined`.
   */
  required: boolean;
  /** What its value must be; absent when the outline cannot tell, and any value may be. */
  outline?: SchemaOutline;
}

/**
 * What a schema takes, as the Playground checks variables before it sends
 * them: the JSON type of a value, the values an enum allows, an object's
 * fields, an array's items, a union's forms. A part of a schema whose
 * values the outline cannot tell — one that converts what it is given
 * first, falls back on a value of its own, or checks a type JSON has no
 * word for — is left out, and takes any value. Bounds, formats and
 * refinements are the schema's to check when the call is sent.
 */
export type SchemaOutline =
  | { type: "string" | "number" | "boolean" | "null" }
  /** An object: with the fields its schema declares, or — for a record — with any keys. */
  | { type: "object"; fields?: readonly OutlineField[] }
  /** An array: each item what `items` says, or any value when it is absent. */
  | { type: "array"; items?: SchemaOutline }
  | { type: "enum"; values: readonly OutlineValue[] }
  | { type: "union"; options: readonly SchemaOutline[] };
