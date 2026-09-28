/**
 * Schema introspection types — shared across all introspection modules.
 */

/** Supported schema field types */
export type FieldType =
  | "string"
  | "number"
  | "bigint"
  | "boolean"
  | "date"
  | "array"
  | "object"
  | "enum"
  | "optional"
  | "nullable"
  | "tuple"
  | "record"
  | "literal"
  | "union"
  | "unknown";

/**
 * Checks a generated value has to pass, read from the schema and normalized
 * across Zod v4, Zod v3 and Valibot.
 */
export interface ValueConstraints {
  /** Lower bound of a number; exclusive when `exclusiveMin` is set (`gt`, `positive`) */
  min?: number;
  exclusiveMin?: boolean;
  /** Upper bound of a number; exclusive when `exclusiveMax` is set (`lt`, `negative`) */
  max?: number;
  exclusiveMax?: boolean;
  /** Whole numbers only (`int()`, `integer()`, an integer format) */
  integer?: boolean;
  multipleOf?: number;
  /** Length bounds of a string or an array */
  minLength?: number;
  maxLength?: number;
  /** Named string format: `email`, `url`, `uuid`, `datetime`, `date`, `time`, ... */
  format?: string;
  /** Patterns a string must match: `regex()` and the patterns formats carry */
  patterns?: RegExp[];
  startsWith?: string;
  endsWith?: string;
  /** Substrings a string must contain */
  includes?: string[];
}

/** Extracted field metadata from a schema */
export interface FieldMeta extends ValueConstraints {
  type: FieldType;
  /** Enum string values (z.enum / v.picklist) */
  enumValues?: Array<string | number>;
  /** Inner field for optional/nullable/array wrappers */
  innerField?: FieldMeta;
  /** Raw object shape (field name → raw schema) */
  shape?: Record<string, unknown>;
  /** Literal constant value */
  literalValue?: unknown;
  /** Union variant field metas */
  variants?: FieldMeta[];
  /** Discriminated union key name */
  discriminator?: string;
  /** Tuple item field metas (ordered) */
  items?: FieldMeta[];
  /** Record value field meta */
  valueField?: FieldMeta;
  /** Schema-declared default value */
  defaultValue?: unknown;
}
