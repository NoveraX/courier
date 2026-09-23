import type { PaginatedResult, QueryOptions } from "./pagination";
import type { QueryBuilder } from "./query-builder";

/** Configuration for a collection */
export interface CollectionConfig {
  /** Field used as primary key (default: "id") */
  idField?: string;
}

export type QueryFn<TItem> = (q: QueryBuilder<TItem>) => QueryBuilder<TItem>;

/** In-memory CRUD collection with querying, sorting, and pagination */
export interface Collection<TItem extends Record<string, unknown>> {
  /** Field used as primary key */
  readonly idField: string;
  /** Change the collection's configuration — its primary key field */
  configure(config: CollectionConfig): void;
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
  /** Find by primary key; `1` and `"1"` name the same record */
  getById(id: string | number): TItem | undefined;
  /** Replace the record with this id wholesale, keeping its id; undefined if there is none */
  replace(id: string | number, item: Partial<TItem>): TItem | undefined;
  /** Update the record with this id; undefined if there is none */
  updateById(
    id: string | number,
    patch: Partial<TItem> | ((item: TItem) => void),
  ): TItem | undefined;
  /** Delete the record with this id; whether there was one */
  deleteById(id: string | number): boolean;
  /** Clear all records */
  clear(): void;
}
