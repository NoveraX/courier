import { createLogger } from "@noverax/courier";
import { isRecord } from "../is-record";
import type { MockStore } from "./mock-store";
import { storeChanges } from "./store-changes";
import { type OpenedStore, openStoreDatabase, type StoreDatabase } from "./store-database";
import { type CollectionMirror, storeMirrors } from "./store-mirror";

const log = createLogger("MockStore");

/* Changes in quick succession, such as a client creating a list of records, are saved once. */
const SAVE_DELAY_MS = 200;

/** Where a mock server keeps its store, so its records survive a restart. */
export interface StorePersistOptions {
  /**
   * The SQLite file the store is kept in. Created, with its folder, when the
   * server starts; its schema is Courier's own and kept current by Courier.
   */
  file: string;
  /**
   * The collections taken from the file when the server starts; left out,
   * every one it holds. A collection the server no longer serves is then
   * left behind rather than brought back.
   */
  collections?: readonly string[] | undefined;
}

/** A store kept in a file. */
export interface StorePersistence {
  /** Take the records the file holds into the store, replacing what each of those collections holds. */
  restore(): Promise<void>;
  /** Save the store shortly: changes in quick succession are saved once. */
  schedule(): void;
  /** Save what is not saved yet, at once. */
  flush(): Promise<void>;
  /** Save what is not saved yet, and let go of the file; `restore` opens it again. */
  close(): Promise<void>;
}

/* The records a collection's rows hold, in order; `null` when one is no
   record, or no JSON — a file edited by hand. */
function recordsOf(mirror: CollectionMirror): Record<string, unknown>[] | null {
  const records: Record<string, unknown>[] = [];
  for (const { data } of mirror.rows.values()) {
    let record: unknown;
    try {
      record = JSON.parse(data);
    } catch (error) {
      log.debug("A stored record is not JSON", error);
      return null;
    }
    if (!isRecord(record)) return null;
    records.push(record);
  }
  return records;
}

/**
 * Keep a store in an SQLite file: each save writes, in one transaction, only
 * the records that changed since the last.
 *
 * Nothing is asked of the developer: the file, its folder and its schema are
 * created, and a file from an earlier Courier is brought up to date, as the
 * server starts. A file that cannot be read is kept aside and a new one
 * started; where the runtime has no SQLite, or the file was written by a newer
 * Courier, the store keeps its records only while the server runs, and says
 * so. A save that fails is reported, and the next change tries again.
 *
 * @param store - The store
 * @param options - The file, and which of its collections to restore
 * @param open - Opens the file; `openStoreDatabase` outside tests
 * @returns The persistence the server drives
 * @example
 * ```ts
 * const persistence = createStorePersistence(server.store, { file: ".courier/mocks/users.sqlite" });
 * await persistence.restore();
 * ```
 */
export function createStorePersistence(
  store: MockStore,
  options: StorePersistOptions,
  open: (file: string) => Promise<OpenedStore> = openStoreDatabase,
): StorePersistence {
  const { file } = options;
  let mirrors = new Map<string, CollectionMirror>();
  let database: StoreDatabase | null = null;
  let opening: Promise<StoreDatabase | null> | null = null;
  let refused = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function openOnce(): Promise<StoreDatabase | null> {
    try {
      const opened = await open(file);
      if ("refusal" in opened) {
        refused = true;
        log.warn(
          `The store keeps its records only while the server runs: ${file} — ${opened.refusal}`,
        );
        return null;
      }
      if (opened.note !== null)
        log.warn(`The store starts from its seeds: ${file} — ${opened.note}`);
      mirrors = storeMirrors(opened.database.read());
      database = opened.database;
      return database;
    } catch (error) {
      log.warn(`The store could not open ${file}; it tries again at the next change`, error);
      return null;
    }
  }

  function ready(): Promise<StoreDatabase | null> {
    if (database !== null || refused) return Promise.resolve(database);
    opening ??= openOnce().finally(() => {
      opening = null;
    });
    return opening;
  }

  async function flush(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    const db = await ready();
    if (db === null) return;
    try {
      const save = storeChanges(store, mirrors);
      if (save === null) return;
      db.write(save.changes);
      save.settle();
    } catch (error) {
      log.warn(`The store could not be saved to ${file}; it tries again at the next change`, error);
    }
  }

  return {
    async restore() {
      if ((await ready()) === null) return;
      const keep = options.collections === undefined ? null : new Set(options.collections);
      for (const [name, mirror] of mirrors) {
        if (keep !== null && !keep.has(name)) continue;
        const records = recordsOf(mirror);
        if (records === null) {
          log.warn(
            `The store starts "${name}" from its seeds: ${file} holds a value there that is no record`,
          );
          continue;
        }
        const collection = store.collection(name);
        collection.seed(records);
        const rows = [...mirror.rows.keys()];
        collection.getAll().forEach((record, index) => {
          const row = rows[index];
          if (row !== undefined) mirror.keys.set(record, row);
        });
      }
    },
    schedule() {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        void flush();
      }, SAVE_DELAY_MS);
      timer.unref();
    },
    flush,
    async close() {
      await flush();
      database?.close();
      database = null;
    },
  };
}
