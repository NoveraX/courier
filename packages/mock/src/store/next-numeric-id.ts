/**
 * The id after the largest when every record's id is a number: the id a
 * record added to a collection of numeric ids gets, so a schema that types
 * ids as numbers accepts it and a later lookup by number finds it.
 *
 * @param records - The collection's records
 * @param idField - The field that holds each record's id
 * @returns One past the largest id, 1 when there are no records, or
 *   `undefined` when an id is not a number
 * @example
 * ```ts
 * nextNumericId([{ id: 3 }, { id: 9 }], "id"); // 10
 * nextNumericId([{ id: "a" }], "id"); // undefined
 * ```
 */
export function nextNumericId(
  records: readonly Record<string, unknown>[],
  idField: string,
): number | undefined {
  let largest = 0;
  for (const record of records) {
    const id = record[idField];
    if (typeof id !== "number") return undefined;
    if (id > largest) largest = id;
  }
  return largest + 1;
}
