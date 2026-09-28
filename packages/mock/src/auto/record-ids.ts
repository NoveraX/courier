import { MockHttpError } from "../server/errors";
import type { Collection } from "../store";
import { sameId } from "../store/same-id";
import { prop } from "./schema-introspect/prop";

type AnyCollection = Collection<Record<string, unknown>>;

/** The field a request names its record by, and the value it gives */
export interface RecordKey {
  field: string;
  value: string | number;
}

/**
 * Which record a request names. A route's record parameter names a field
 * when the records carry one of that name — `by-email/:email` looks up by
 * `email`, `:petId` by `petId` — and the collection's id otherwise, so
 * `:id` and `:userId` both read the id. Values are kept as they came:
 * `"007"` stays a string, since `1` and `"1"` match alike.
 *
 * @param variables The request's variables
 * @param col       The collection the route serves
 * @param idParam   The route's record parameter, when its path has one
 * @returns The field and value, or `undefined` when the request gives none
 * @example
 * ```ts
 * recordKey({ email: "a@x.io" }, users, "email"); // { field: "email", value: "a@x.io" }
 * recordKey({ id: 3 }, users, "id");              // { field: "id", value: 3 }
 * ```
 */
export function recordKey(
  variables: unknown,
  col: AnyCollection,
  idParam?: string,
): RecordKey | undefined {
  const read = (key: string): unknown => prop(variables, key);
  const byField = idParam !== undefined && idParam !== col.idField && carriesField(col, idParam);
  if (byField) return keyOf(idParam, read(idParam));
  const candidates = [idParam, col.idField, "id", "ID", "Id"];
  const found = candidates.find((key) => key !== undefined && isKeyValue(read(key)));
  return found === undefined ? undefined : keyOf(col.idField, read(found));
}

/**
 * The record a key names.
 *
 * @param col The collection to search
 * @param key The field and value a request names
 * @returns The record, or `undefined` when none matches
 * @example
 * ```ts
 * findRecord(users, { field: "email", value: "a@x.io" });
 * ```
 */
export function findRecord(
  col: AnyCollection,
  key: RecordKey | undefined,
): Record<string, unknown> | undefined {
  if (!key) return undefined;
  if (key.field === col.idField) return col.getById(key.value);
  return col.getAll().find((record) => sameId(record[key.field], key.value));
}

/**
 * The 404 for a request whose record does not exist.
 *
 * @param groupName The collection's group
 * @param key       The field and value the request named, if it named any
 * @returns The error to throw from a handler
 * @example
 * ```ts
 * throw recordNotFound("pets", { field: "petId", value: "p-9" }); // 404 "pets with petId p-9 not found"
 * ```
 */
export function recordNotFound(groupName: string, key: RecordKey | undefined): MockHttpError {
  if (!key) return new MockHttpError(404, `${groupName}: the request names no record`);
  return new MockHttpError(404, `${groupName} with ${key.field} ${key.value} not found`);
}

/**
 * A record's id as a lookup key.
 *
 * @param col    The collection holding the record
 * @param record The record
 * @returns Its id field's value, as a string unless it is a number
 * @example
 * ```ts
 * idOf(pets, { petId: "p-1", name: "Rex" }); // "p-1"
 * ```
 */
export function idOf(col: AnyCollection, record: Record<string, unknown>): string | number {
  const id = record[col.idField];
  return typeof id === "number" ? id : String(id);
}

/**
 * An id no record of the collection holds: one past the largest when its
 * ids are numbers, a generated one otherwise.
 *
 * `count() + 1` repeated an existing id after any delete, and the new record
 * then hid behind the old one on every by-id route.
 */
export function freshId(col: AnyCollection): number | undefined {
  let largest = 0;
  for (const record of col.getAll()) {
    const id = record[col.idField];
    if (typeof id !== "number") return undefined;
    if (id > largest) largest = id;
  }
  return largest + 1;
}

/**
 * A generated id, when no record holds it yet — the key a schema-generated
 * record came with, such as a UUID for a collection keyed by one.
 *
 * @param col       The collection the record goes into
 * @param candidate The id generated with the record
 * @returns The id, or `undefined` when it is taken or not an id, and the
 *   collection generates one itself
 * @example
 * ```ts
 * unusedId(pets, "7f958ceb-7a80-4478-9f50-e10ac1c6c171"); // the UUID, unless a pet holds it
 * ```
 */
export function unusedId(col: AnyCollection, candidate: unknown): string | number | undefined {
  if (!isKeyValue(candidate)) return undefined;
  return col.getById(candidate) ? undefined : candidate;
}

/** An id from a URL, typed like the collection's ids so a later lookup reads it back */
export function typedLike(col: AnyCollection, id: string | number): string | number {
  if (typeof id === "number") return id;
  const numeric = col.getAll().some((record) => typeof record[col.idField] === "number");
  return numeric && String(Number(id)) === id ? Number(id) : id;
}

function carriesField(col: AnyCollection, field: string): boolean {
  return col.getAll().some((record) => field in record);
}

function isKeyValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function keyOf(field: string, value: unknown): RecordKey | undefined {
  return isKeyValue(value) ? { field, value } : undefined;
}
