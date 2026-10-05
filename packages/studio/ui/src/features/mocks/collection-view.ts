import type { MockCollectionEntry, MockRouteEntry } from "@/store/mock-slice";
import type { FieldType } from "./data-table-utils";
import { detectColumns, detectType } from "./data-table-utils";

/** The Store tab's part of the address: the collection open. */
export interface MockStoreSearch {
  collection?: string | undefined;
}

/**
 * Read the Store tab's parameters from its address.
 *
 * @param raw - The address's parameters
 * @returns The collection open, when the address names one
 * @example
 * ```ts
 * validateMockStoreSearch({ collection: "users" }); // { collection: "users" }
 * ```
 */
export function validateMockStoreSearch(raw: Record<string, unknown>): MockStoreSearch {
  return typeof raw.collection === "string" && raw.collection ? { collection: raw.collection } : {};
}

/** A column of a collection's table: its field, the type it shows, and the type values are read back as. */
export interface CollectionColumn {
  field: string;
  label: string;
  type: FieldType;
}

const TYPE_LABELS: Readonly<Record<FieldType, string>> = {
  str: "string",
  num: "number",
  bool: "boolean",
  obj: "object",
  arr: "array",
  null: "null",
};

/**
 * The records of a collection as rows, and its columns: every field its
 * records hold, each labelled with the type the route's response schema
 * gives it — `enum`, `date` — or else the type its first value has.
 *
 * @param collection - The collection
 * @param routes - The server's routes, whose response shapes name the fields' types
 * @returns The rows and the columns
 * @example
 * ```ts
 * collectionView(users, routes).columns.map((c) => c.label); // ["string", "string", "enum"]
 * ```
 */
export function collectionView(
  collection: MockCollectionEntry,
  routes: readonly MockRouteEntry[],
): { rows: Record<string, unknown>[]; columns: CollectionColumn[] } {
  const rows = collection.records.flatMap((record): Record<string, unknown>[] =>
    typeof record === "object" && record !== null && !Array.isArray(record)
      ? [
          Object.fromEntries(
            Object.entries(record).map(([key, value]: [string, unknown]) => [key, value]),
          ),
        ]
      : [],
  );
  const schema =
    routes.find((r) => r.group === collection.name && r.responseSchema)?.responseSchema ?? {};
  const columns = detectColumns(rows).map((field) => {
    const type = detectType(rows[0]?.[field]);
    return { field, type, label: schema[field] ?? TYPE_LABELS[type] };
  });
  return { rows, columns };
}
