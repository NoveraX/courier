import { generateRecord } from "../auto/data-generator/records";
import { seedSources } from "../auto/seed-sources";
import type { Collection } from "../store";
import { CommandInputError } from "./command-input";
import type { ServedMock } from "./types";

/* Past this many ids already taken, the collection names the record itself. */
const MAX_TRIES = 1000;

/**
 * A record for a collection as its seed makes them: of the shape the
 * endpoints answer with, every field a value the schema accepts, under an
 * id no record in the collection has — or none, for the collection to name
 * it, once every id tried is taken.
 *
 * @param served - The mock, whose routes give the schema
 * @param collection - The collection's name
 * @param col - The collection, whose ids the record must not take
 * @returns The record to add
 * @throws {CommandInputError} When no endpoint gives the collection a schema to make a record from
 * @example
 * ```ts
 * col.create(generatedRecord(served, "users", col));
 * ```
 */
export function generatedRecord(
  served: ServedMock,
  collection: string,
  col: Collection<Record<string, unknown>>,
): Record<string, unknown> {
  const schema = seedSources(served.routes).get(collection);
  if (schema === undefined) {
    throw new CommandInputError(
      `Collection "${collection}" has no schema to make a record from; give the record to add`,
    );
  }
  const first = col.count() + 1;
  for (let index = first; index < first + MAX_TRIES; index++) {
    const record = generateRecord(schema, index);
    const id = record[col.idField];
    if (!isId(id) || col.getById(id) === undefined) return record;
  }
  const { [col.idField]: _taken, ...record } = generateRecord(schema, first);
  return record;
}

function isId(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}
