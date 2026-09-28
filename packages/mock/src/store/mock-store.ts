import { createCollection } from "./collection";
import type { Collection, CollectionConfig } from "./collection-types";

/** In-memory store with named collections */
export interface MockStore {
  /** Get or create a typed collection */
  collection<TItem extends Record<string, unknown>>(
    name: string,
    config?: CollectionConfig,
  ): Collection<TItem>;
  /** Check if a collection exists */
  has(name: string): boolean;
  /** List all collection names */
  list(): string[];
  /** Snapshot current state of all collections */
  snapshot(): Record<string, Record<string, unknown>[]>;
  /** Make the store exactly the snapshot: its collections, and no others' records */
  restore(snap: Record<string, Record<string, unknown>[]>): void;
  /** Reset all collections (clear records, keep definitions) */
  reset(): void;
}

/** Create an in-memory mock store */
export function createMockStore(): MockStore {
  const collections = new Map<string, Collection<Record<string, unknown>>>();

  return {
    collection<TItem extends Record<string, unknown>>(
      name: string,
      config?: CollectionConfig,
    ): Collection<TItem> {
      const existing = collections.get(name);
      /* The auto server creates every collection before the app's overrides
         run, so a config given later used to be dropped in silence — and a
         key other than `id` was impossible. */
      if (existing) {
        if (config) existing.configure(config);
        return existing as Collection<TItem>;
      }
      const created = createCollection(config);
      collections.set(name, created);
      return created as Collection<TItem>;
    },

    has(name) {
      return collections.has(name);
    },

    list() {
      return [...collections.keys()];
    },

    snapshot() {
      /* Copies: handing out the live records let every later update edit
         the snapshot too, so restore() could not undo it. */
      const snap: Record<string, Record<string, unknown>[]> = {};
      for (const [name, col] of collections) {
        snap[name] = structuredClone(col.getAll());
      }
      return snap;
    },

    restore(snap) {
      /* The store becomes exactly the snapshot: a collection it did not know
         is created, and one it does not mention is emptied. Restoring used
         to touch only collections that already existed. */
      for (const [name, col] of collections) {
        if (!Object.hasOwn(snap, name)) col.clear();
      }
      for (const [name, data] of Object.entries(snap)) {
        this.collection(name).seed(data);
      }
    },

    reset() {
      for (const col of collections.values()) {
        col.clear();
      }
    },
  };
}
