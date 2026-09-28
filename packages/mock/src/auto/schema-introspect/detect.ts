/**
 * Schema type detection across Zod v3, Zod v4, and Valibot.
 */

import { prop } from "./prop";
import type { FieldType } from "./types";

const TYPE_MAP: Record<string, FieldType> = {
  string: "string",
  number: "number",
  bigint: "bigint",
  boolean: "boolean",
  array: "array",
  object: "object",
  enum: "enum",
  optional: "optional",
  nullable: "nullable",
  date: "date",
  tuple: "tuple",
  record: "record",
  literal: "literal",
  union: "union",
  // Zod v3 aliases
  nativeenum: "enum",
  discriminatedunion: "union",
  // Valibot aliases
  picklist: "enum",
  variant: "union",
};

const ZOD_PREFIX = /^Zod/;

function normalizeType(raw: string): FieldType {
  return TYPE_MAP[raw.toLowerCase()] ?? "unknown";
}

/** Detect schema field type from Zod v4, Zod v3, or Valibot metadata */
export function getFieldType(field: unknown): FieldType {
  if (!field || typeof field !== "object") return "unknown";

  // Zod v4: _zod.def.type. Zod v3 keeps an array's element schema in
  // _def.type, so only a string there names the type.
  const v4Type = prop(field, "_zod", "def", "type") ?? prop(field, "_def", "type");
  if (typeof v4Type === "string") return normalizeType(v4Type);

  // Zod v3: _def.typeName → strip "Zod" prefix
  const v3Type = prop(field, "_def", "typeName");
  if (typeof v3Type === "string") return normalizeType(v3Type.replace(ZOD_PREFIX, ""));

  // Valibot: .type
  const valibotType = prop(field, "type");
  if (typeof valibotType === "string") return normalizeType(valibotType);

  return "unknown";
}

const RAW_TYPE_PATHS = [["_zod", "def", "type"], ["_def", "typeName"], ["_def", "type"], ["type"]];

/**
 * Get the raw type name before normalization.
 * Used to detect transparent wrappers (default, transform, etc.)
 */
export function getRawTypeName(field: unknown): string | undefined {
  for (const path of RAW_TYPE_PATHS) {
    const name = prop(field, ...path);
    if (typeof name === "string") return name;
  }
  return undefined;
}

/** Wrapper types that should be transparently unwrapped to their inner type */
const TRANSPARENT_WRAPPERS = new Set([
  // Zod v4
  "default",
  "transform",
  "pipe",
  "catch",
  "brand",
  "readonly",
  "lazy",
  // Zod v3
  "zoddefault",
  "zodeffects",
  "zodpipeline",
  "zodcatch",
  "zodbranded",
  "zodreadonly",
  "zodlazy",
]);

/** Check if a schema is a transparent wrapper (default, transform, brand, etc.) */
export function isTransparentWrapper(field: unknown): boolean {
  const raw = getRawTypeName(field);
  return raw ? TRANSPARENT_WRAPPERS.has(raw.toLowerCase()) : false;
}
