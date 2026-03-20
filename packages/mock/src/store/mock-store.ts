import type { Collection, CollectionConfig } from "./collection";
import { createCollection } from "./collection";

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
  snapshot(): Record<string, unknown[]>;
  /** Restore all collections from a snapshot */
  restore(snap: Record<string, unknown[]>): void;
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
      if (!collections.has(name)) {
        collections.set(name, createCollection(config));
      }
      return collections.get(name) as Collection<TItem>;
    },

    has(name) {
      return collections.has(name);
    },

    list() {
      return [...collections.keys()];
    },

    snapshot() {
      const snap: Record<string, unknown[]> = {};
      for (const [name, col] of collections) {
        snap[name] = col.getAll();
      }
      return snap;
    },

    restore(snap) {
      for (const [name, data] of Object.entries(snap)) {
        const col = collections.get(name);
        if (col) col.seed(data as Record<string, unknown>[]);
      }
    },

    reset() {
      for (const col of collections.values()) {
        col.clear();
      }
    },
  };
}
