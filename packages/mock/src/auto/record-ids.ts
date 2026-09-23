import type { Collection } from "../store";

/**
 * The id a request names: the `id` variable a route's `:id` fills.
 * Kept as it came — `"007"` stays a string — since a collection matches
 * `1` and `"1"` alike.
 */
export function requestedId(variables: unknown): string | number | undefined {
  if (!variables || typeof variables !== "object") return undefined;
  const vars = variables as Record<string, unknown>;
  const raw = vars.id ?? vars.ID ?? vars.Id;
  return typeof raw === "string" || typeof raw === "number" ? raw : undefined;
}

/**
 * An id no record of the collection holds: one past the largest when its
 * ids are numbers, a generated one otherwise.
 *
 * `count() + 1` repeated an existing id after any delete, and the new record
 * then hid behind the old one on every by-id route.
 */
export function freshId(col: Collection<Record<string, unknown>>): number | undefined {
  let largest = 0;
  for (const record of col.getAll()) {
    const id = record[col.idField];
    if (typeof id !== "number") return undefined;
    if (id > largest) largest = id;
  }
  return largest + 1;
}

/** An id from a URL, typed like the collection's ids so a later lookup reads it back */
export function typedLike(
  col: Collection<Record<string, unknown>>,
  id: string | number,
): string | number {
  if (typeof id === "number") return id;
  const numeric = col.getAll().some((record) => typeof record[col.idField] === "number");
  return numeric && String(Number(id)) === id ? Number(id) : id;
}
