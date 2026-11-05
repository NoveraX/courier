import type { MetaValue } from "./ws-registry-types";

/** The most connections one selector names by id. */
const MAX_IDS = 1_000;
/** The most metadata fields one selector compares. */
const MAX_FIELDS = 16;
/** The longest connection id or field name a selector takes, in characters. */
const MAX_NAME_LENGTH = 128;
/** The longest string a field is compared to, in characters. */
const MAX_VALUE_LENGTH = 1_024;

const NOT_A_SELECTOR = "a selector is a connection id, { id } or { meta }";

/** A selector read: the ids it names, or the fields it compares. */
export type Selection =
  | { readonly ids: readonly string[] }
  | { readonly fields: ReadonlyArray<readonly [string, MetaValue]> };

/**
 * Read a connection selector — a connection id, `{ id }` with one or more,
 * at most 1000, or `{ meta }` comparing 1 to 16 fields, each to a string, a
 * finite number or a boolean — or say why the value is none. The same
 * reading checks what the application passes and what another replica
 * sends, so a selector is bounded wherever it comes from; why it is none
 * never repeats what it holds.
 *
 * @param value - What names the connections
 * @returns The selection, or why the value names no connection
 *
 * @example
 * ```ts
 * readSelector({ meta: { userId: "u1" } }); // { fields: [["userId", "u1"]] }
 * readSelector({ id: [] }); // "a selector's id names one connection or more"
 * ```
 */
export function readSelector(value: unknown): Selection | string {
  if (typeof value === "string") return idsOf([value]);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return NOT_A_SELECTOR;
  const keys = Object.keys(value);
  if (keys.length !== 1) return "a selector names its connections either by id or by meta";
  const record = value as Record<string, unknown>;
  if (keys[0] === "id") return idsOf(Array.isArray(record.id) ? record.id : [record.id]);
  if (keys[0] === "meta") return fieldsOf(record.meta);
  return NOT_A_SELECTOR;
}

/**
 * Whether metadata has every field of a selection equal to its value. Only
 * the connection's own fields count: a selector naming `constructor` or
 * `__proto__` matches what the connection was given, not what every object
 * inherits.
 *
 * @param meta - A connection's metadata
 * @param fields - The fields a selection compares
 * @returns Whether each field is the connection's own and equal to its value
 */
export function hasFields(
  meta: Readonly<Record<string, unknown>>,
  fields: ReadonlyArray<readonly [string, MetaValue]>,
): boolean {
  return fields.every(([name, value]) => Object.hasOwn(meta, name) && meta[name] === value);
}

function idsOf(ids: readonly unknown[]): Selection | string {
  if (ids.length === 0) return "a selector's id names one connection or more";
  if (ids.length > MAX_IDS) return `a selector names at most ${MAX_IDS} connections by id`;
  if (!ids.every(isName)) {
    return `a connection id is a string of 1 to ${MAX_NAME_LENGTH} characters`;
  }
  return { ids: ids as string[] };
}

function fieldsOf(meta: unknown): Selection | string {
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) {
    return "a selector's meta is an object of the fields it compares";
  }
  const fields: Array<[string, unknown]> = Object.entries(meta);
  if (fields.length === 0 || fields.length > MAX_FIELDS) {
    return `a selector's meta compares 1 to ${MAX_FIELDS} fields`;
  }
  for (const [name, value] of fields) {
    if (!isName(name)) {
      return `a field a selector compares has a name of 1 to ${MAX_NAME_LENGTH} characters`;
    }
    if (!isMetaValue(value)) {
      return `a selector compares each field to a string of at most ${MAX_VALUE_LENGTH} characters, a finite number or a boolean`;
    }
  }
  return { fields: fields as Array<[string, MetaValue]> };
}

function isName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_NAME_LENGTH;
}

function isMetaValue(value: unknown): value is MetaValue {
  if (typeof value === "string") return value.length <= MAX_VALUE_LENGTH;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "boolean";
}
