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

/** Extracted field metadata from a schema */
export interface FieldMeta {
  type: FieldType;
  /** Enum string values (z.enum / v.picklist) */
  enumValues?: string[];
  /** Inner field for optional/nullable/array wrappers */
  innerField?: FieldMeta;
  /** Raw object shape (field name → raw schema) */
  shape?: Record<string, unknown>;
  /** Number min/max constraints */
  min?: number;
  max?: number;
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
