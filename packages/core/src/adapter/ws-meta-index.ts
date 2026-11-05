import { MAX_NAME_LENGTH, MAX_VALUE_LENGTH } from "./connection-selector";
import type { MetaValue } from "./ws-registry-types";

/** The connections whose metadata has each field's value, for a selector to find them without a pass over every one. */
export interface MetaIndex {
  /** Index a connection by the fields of its metadata */
  add(connectionId: string, meta: Readonly<Record<string, unknown>>): void;
  /** Take a connection out, by the metadata it was indexed with */
  remove(connectionId: string, meta: Readonly<Record<string, unknown>>): void;
  /** The connections whose metadata has every field given equal to its value, as `===` compares it */
  select(fields: ReadonlyArray<readonly [string, MetaValue]>): string[];
}

/**
 * An index of connections by their metadata: for each field, each value a
 * selector can compare it to — a string, a finite number, a boolean — and
 * the connections that have it. A selector's connections are those of the
 * fewest that have one of its fields, checked against the others, so its
 * time is that of its answer, not that of every connection.
 *
 * @returns The index, empty
 * @example
 * ```ts
 * const index = createMetaIndex();
 * index.add("c1", { userId: "u1" });
 * index.select([["userId", "u1"]]); // ["c1"]
 * ```
 */
export function createMetaIndex(): MetaIndex {
  const byField = new Map<string, Map<string, Set<string>>>();

  function each(
    meta: Readonly<Record<string, unknown>>,
    visit: (field: string, value: string) => void,
  ): void {
    for (const [field, value] of Object.entries(meta)) {
      const key = keyOf(value);
      if (key !== undefined && field.length <= MAX_NAME_LENGTH) visit(field, key);
    }
  }

  return {
    add(connectionId, meta) {
      each(meta, (field, key) => {
        let values = byField.get(field);
        if (!values) {
          values = new Map();
          byField.set(field, values);
        }
        let ids = values.get(key);
        if (!ids) {
          ids = new Set();
          values.set(key, ids);
        }
        ids.add(connectionId);
      });
    },
    remove(connectionId, meta) {
      each(meta, (field, key) => {
        const values = byField.get(field);
        const ids = values?.get(key);
        if (!values || !ids) return;
        ids.delete(connectionId);
        if (ids.size === 0) values.delete(key);
        if (values.size === 0) byField.delete(field);
      });
    },
    select(fields) {
      const sets: Set<string>[] = [];
      for (const [field, value] of fields) {
        const ids = byField.get(field)?.get(keyOf(value) ?? "");
        if (!ids) return [];
        sets.push(ids);
      }
      sets.sort((a, b) => a.size - b.size);
      const [fewest, ...others] = sets;
      return [...(fewest ?? [])].filter((id) => others.every((ids) => ids.has(id)));
    },
  };
}

/* A value with its type, so 1, "1" and true are three; `${-0}` is "0", as -0 === 0. */
function keyOf(value: unknown): string | undefined {
  if (typeof value === "string") return value.length <= MAX_VALUE_LENGTH ? `s${value}` : undefined;
  if (typeof value === "number") return Number.isFinite(value) ? `n${value}` : undefined;
  if (typeof value === "boolean") return value ? "t" : "f";
  return undefined;
}
