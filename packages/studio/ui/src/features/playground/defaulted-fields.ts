import type { SchemaField } from "@noverax/courier-studio-core";

/** A field the Playground shows, with what the endpoint sends for it when the call leaves it out. */
export interface ShownField extends SchemaField {
  /** The endpoint's default, when it has one; the field is then not required. */
  default?: unknown;
}

/* What a value is, written as the schema table writes a type. */
function typeOfValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * The fields the Playground shows and checks an endpoint's variables
 * against: the schema's, each one `.defaults()` fills in carrying its
 * default and no longer required — the server sends it when the call does
 * not — and a field of its own for each default no schema describes.
 *
 * @param fields - The fields the variables schema declares, when Studio can read them
 * @param defaults - What the endpoint's `.defaults()` fills in
 * @returns The fields, or `undefined` when there are neither
 * @example
 * ```ts
 * fieldsWithDefaults(undefined, { limit: 5 }); // [{ path: "limit", type: "number", required: false, default: 5 }]
 * ```
 */
export function fieldsWithDefaults(
  fields: readonly SchemaField[] | undefined,
  defaults: Readonly<Record<string, unknown>> | undefined,
): ShownField[] | undefined {
  if (defaults === undefined) return fields ? [...fields] : undefined;
  const shown: ShownField[] = (fields ?? []).map((field) =>
    Object.hasOwn(defaults, field.path)
      ? { ...field, required: false, default: defaults[field.path] }
      : field,
  );
  for (const [name, value] of Object.entries(defaults)) {
    if (shown.some((field) => field.path === name)) continue;
    shown.push({ path: name, type: typeOfValue(value), required: false, default: value });
  }
  return shown;
}
