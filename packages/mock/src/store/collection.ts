import type { PaginatedResult, QueryOptions } from "./pagination";
import { applyPagination, applySorting } from "./pagination";
import type { QueryBuilder } from "./query-builder";
import { createQueryBuilder } from "./query-builder";

/** Configuration for a collection */
export interface CollectionConfig {
  /** Field used as primary key (default: "id") */
  idField?: string;
}

type QueryFn<TItem> = (q: QueryBuilder<TItem>) => QueryBuilder<TItem>;

/** In-memory CRUD collection with querying, sorting, and pagination */
export interface Collection<TItem extends Record<string, unknown>> {
  /** Create a single record (auto-generates id if missing) */
  create(item: Partial<TItem>): TItem;
  /** Create N records with an index-based factory */
  createMany(count: number, fn: (index: number) => Partial<TItem>): TItem[];
  /** Find first matching record */
  findFirst(query?: QueryFn<TItem> | null): TItem | undefined;
  /** Find all matching records with optional pagination/sorting */
  findMany(query?: QueryFn<TItem> | null, options?: QueryOptions<TItem>): PaginatedResult<TItem>;
  /** Update first matching record */
  update(
    query: QueryFn<TItem>,
    patch: { data: Partial<TItem> | ((item: TItem) => void) },
  ): TItem | undefined;
  /** Update all matching records */
  updateMany(
    query: QueryFn<TItem>,
    patch: { data: Partial<TItem> | ((item: TItem) => void) },
  ): number;
  /** Delete first matching record */
  delete(query: QueryFn<TItem>): boolean;
  /** Delete all matching records */
  deleteMany(query: QueryFn<TItem>): number;
  /** Get total count of records (optionally filtered) */
  count(query?: QueryFn<TItem> | null): number;
  /** Seed collection with initial data (replaces all) */
  seed(items: TItem[]): void;
  /** Get all records (raw array) */
  getAll(): TItem[];
  /** Find by primary key */
  getById(id: string | number): TItem | undefined;
  /** Clear all records */
  clear(): void;
}

let autoIdCounter = 0;

/** Create an in-memory collection */
export function createCollection<TItem extends Record<string, unknown>>(
  config?: CollectionConfig,
): Collection<TItem> {
  const idField = config?.idField ?? "id";
  let records: TItem[] = [];

  const filter = (query?: QueryFn<TItem> | null): TItem[] => {
    if (!query) return [...records];
    const qb = createQueryBuilder<TItem>();
    const built = query(qb);
    return records.filter((r) => built.test(r));
  };

  const generateId = (): string => {
    autoIdCounter++;
    return `auto-${autoIdCounter}`;
  };

  const collection: Collection<TItem> = {
    create(item) {
      const record = { ...item } as TItem;
      if (!(idField in record) || record[idField] === undefined) {
        (record as Record<string, unknown>)[idField] = generateId();
      }
      records.push(record);
      return record;
    },

    createMany(count, fn) {
      return Array.from({ length: count }, (_, i) => collection.create(fn(i)));
    },

    findFirst(query) {
      const results = filter(query);
      return results[0];
    },

    findMany(query, options) {
      let results = filter(query);
      results = applySorting(results, options?.orderBy);
      return applyPagination(results, options ?? {}, idField);
    },

    update(query, patch) {
      const qb = createQueryBuilder<TItem>();
      const built = query(qb);
      const index = records.findIndex((r) => built.test(r));
      if (index < 0) return undefined;

      const record = records[index];
      if (!record) return undefined;
      applyPatch(record, patch.data);
      return record;
    },

    updateMany(query, patch) {
      const matching = filter(query);
      for (const record of matching) {
        applyPatch(record, patch.data);
      }
      return matching.length;
    },

    delete(query) {
      const qb = createQueryBuilder<TItem>();
      const built = query(qb);
      const index = records.findIndex((r) => built.test(r));
      if (index < 0) return false;
      records.splice(index, 1);
      return true;
    },

    deleteMany(query) {
      const before = records.length;
      const qb = createQueryBuilder<TItem>();
      const built = query(qb);
      records = records.filter((r) => !built.test(r));
      return before - records.length;
    },

    count(query) {
      return filter(query).length;
    },

    seed(items) {
      records = structuredClone(items);
    },

    getAll() {
      return [...records];
    },

    getById(id) {
      return records.find((r) => r[idField] === id);
    },

    clear() {
      records = [];
    },
  };

  return collection;
}

function applyPatch<TItem extends Record<string, unknown>>(
  record: TItem,
  patch: Partial<TItem> | ((item: TItem) => void),
): void {
  if (typeof patch === "function") {
    patch(record);
  } else {
    Object.assign(record, patch);
  }
}
