import type { Collection, CollectionConfig, QueryFn } from "./collection-types";
import { nextNumericId } from "./next-numeric-id";
import { applyPagination, applySorting } from "./pagination";
import { createQueryBuilder } from "./query-builder";
import { sameId } from "./same-id";

/** Create an in-memory collection */
export function createCollection<TItem extends Record<string, unknown>>(
  config?: CollectionConfig,
): Collection<TItem> {
  let idField = config?.idField ?? "id";
  let records: TItem[] = [];
  /* Per collection, and reset with it: a counter shared by the whole process
     made generated ids depend on what every other store had created. */
  let autoIdCounter = 0;

  const filter = (query?: QueryFn<TItem> | null): TItem[] => {
    if (!query) return [...records];
    const qb = createQueryBuilder<TItem>();
    const built = query(qb);
    return records.filter((r) => built.test(r));
  };

  /* A number when every id is one, as an HTTP create gives; a string in an
     empty collection, whose id type is not known, and otherwise. */
  const generateId = (): string | number => {
    const numeric = records.length > 0 ? nextNumericId(records, idField) : undefined;
    if (numeric !== undefined) return numeric;
    let id: string;
    do {
      autoIdCounter++;
      id = `auto-${autoIdCounter}`;
    } while (collection.getById(id));
    return id;
  };

  const collection: Collection<TItem> = {
    get idField() {
      return idField;
    },

    configure(next) {
      idField = next.idField ?? idField;
    },

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
      return records.find((r) => sameId(r[idField], id));
    },

    updateById(id, patch) {
      const record = collection.getById(id);
      if (record) applyPatch(record, patch);
      return record;
    },

    deleteById(id) {
      const record = collection.getById(id);
      if (!record) return false;
      records.splice(records.indexOf(record), 1);
      return true;
    },

    replace(id, item) {
      const record = collection.getById(id);
      if (!record) return undefined;
      const kept = record[idField];
      for (const key of Object.keys(record)) delete record[key];
      Object.assign(record, item, { [idField]: kept });
      return record;
    },

    clear() {
      records = [];
      autoIdCounter = 0;
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
