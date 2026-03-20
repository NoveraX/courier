/**
 * Schema introspection — extracts type information from Zod (v3/v4) and Valibot schemas.
 * Used by the data generator to produce type-correct mock data.
 */

/** Extracted field metadata from a schema */
export interface FieldMeta {
  type: FieldType;
  enumValues?: string[];
  innerField?: FieldMeta;
  shape?: Record<string, unknown>;
  /** Number constraints from schema (e.g. z.number().min(0).max(100)) */
  min?: number;
  max?: number;
}

export type FieldType =
  | "string"
  | "number"
  | "bigint"
  | "boolean"
  | "array"
  | "object"
  | "enum"
  | "optional"
  | "nullable"
  | "date"
  | "unknown";

/** Extract object shape (field name → raw field schema) from a schema */
export function extractShape(schema: unknown): Record<string, unknown> | undefined {
  if (!schema || typeof schema !== "object") return undefined;

  // Zod v4: schema.shape or _def.shape
  const shape = (schema as { shape?: Record<string, unknown> }).shape;
  if (shape && typeof shape === "object") return shape;

  const defShape = (schema as { _def?: { shape?: Record<string, unknown> } })?._def?.shape;
  if (defShape && typeof defShape === "object") return defShape;

  // Valibot: schema.entries
  const entries = (schema as { entries?: Record<string, unknown> }).entries;
  if (entries && typeof entries === "object") return entries;

  return undefined;
}

/** Analyze a raw field schema into structured FieldMeta */
export function analyzeField(field: unknown): FieldMeta {
  const type = getFieldType(field);

  if (type === "optional" || type === "nullable") {
    const inner = getInnerType(field);
    return { type, innerField: inner ? analyzeField(inner) : undefined };
  }

  if (type === "enum") {
    return { type, enumValues: getEnumValues(field) };
  }

  if (type === "number") {
    return { type, ...getNumberConstraints(field) };
  }

  if (type === "array") {
    const element = getArrayElement(field);
    return { type, innerField: element ? analyzeField(element) : undefined };
  }

  if (type === "object") {
    return { type, shape: extractShape(field) };
  }

  return { type };
}

/** If schema is an array type, extract the inner element schema */
export function unwrapArraySchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return undefined;

  // Zod v4: _def.element
  const v4Element = (schema as { _def?: { element?: unknown } })?._def?.element;
  if (v4Element) return v4Element;

  // Zod v3: _def.type (confusingly named)
  const v3Def = (schema as { _def?: { typeName?: string; type?: unknown } })?._def;
  if (v3Def?.typeName === "ZodArray") return v3Def.type;

  // Valibot: item
  const valibotItem = schema as { type?: string; item?: unknown };
  if (valibotItem.type === "array") return valibotItem.item;

  return undefined;
}

// ── Type detection ────────────────────────────────────────────────────────────

function getFieldType(field: unknown): FieldType {
  // Zod v4: _zod.def.type or _def.type
  const v4Type =
    (field as { _zod?: { def?: { type?: string } } })?._zod?.def?.type ??
    (field as { _def?: { type?: string } })?._def?.type;
  if (v4Type) return normalizeType(v4Type);

  // Zod v3: _def.typeName
  const v3Type = (field as { _def?: { typeName?: string } })?._def?.typeName;
  if (v3Type) return normalizeType(v3Type.replace(/^Zod/, "").toLowerCase());

  // Valibot: .type
  const valibotType = (field as { type?: string })?.type;
  if (valibotType) return normalizeType(valibotType);

  return "unknown";
}

function normalizeType(raw: string): FieldType {
  const map: Record<string, FieldType> = {
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
  };
  return map[raw] ?? "unknown";
}

// ── Inner type unwrapping ─────────────────────────────────────────────────────

function getInnerType(field: unknown): unknown {
  return (
    (field as { _zod?: { def?: { innerType?: unknown } } })?._zod?.def?.innerType ??
    (field as { _def?: { innerType?: unknown } })?._def?.innerType ??
    (field as { wrapped?: unknown })?.wrapped
  );
}

function getArrayElement(field: unknown): unknown {
  return (
    (field as { _def?: { element?: unknown } })?._def?.element ??
    (field as { _zod?: { def?: { element?: unknown } } })?._zod?.def?.element ??
    (field as { _def?: { type?: unknown; typeName?: string } })?._def?.type // Zod v3
  );
}

// ── Enum extraction ───────────────────────────────────────────────────────────

function getEnumValues(field: unknown): string[] | undefined {
  // Zod v4: _def.entries → { "pending": "pending", ... }
  const v4Entries = (field as { _def?: { entries?: Record<string, string> } })?._def?.entries;
  if (v4Entries && typeof v4Entries === "object") return Object.values(v4Entries);

  // Zod v4 alt: values array
  const v4Values = (field as { _zod?: { def?: { values?: string[] } } })?._zod?.def?.values;
  if (Array.isArray(v4Values)) return v4Values;

  // Zod v3: _def.values
  const v3Values = (field as { _def?: { values?: string[] } })?._def?.values;
  if (Array.isArray(v3Values)) return v3Values;

  return undefined;
}

// ── Number constraints ────────────────────────────────────────────────────────

interface NumberConstraints {
  min?: number;
  max?: number;
}

function getNumberConstraints(field: unknown): NumberConstraints {
  const checks =
    (field as { _zod?: { def?: { checks?: Array<{ kind: string; value: number }> } } })?._zod?.def
      ?.checks ??
    (field as { _def?: { checks?: Array<{ kind: string; value: number }> } })?._def?.checks;

  if (!Array.isArray(checks)) return {};

  const result: NumberConstraints = {};
  for (const check of checks) {
    if (check.kind === "min") result.min = check.value;
    if (check.kind === "max") result.max = check.value;
  }
  return result;
}
