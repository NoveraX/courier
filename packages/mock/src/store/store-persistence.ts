import { createLogger } from "@noverax/courier";
import type { MockStore } from "./mock-store";
import { readStoreFile, storeFileText, writeStoreText } from "./store-file";

const log = createLogger("MockStore");

/* Changes in quick succession, such as a client creating a list of records, are written once. */
const SAVE_DELAY_MS = 200;

/** Where a mock server keeps its store, so its records survive a restart. */
export interface StorePersistOptions {
  /** The JSON file the store is kept in; created, with its folder, at the first change. */
  file: string;
  /**
   * The collections taken from the file when the server starts; left out,
   * every one it holds. A collection the server no longer serves is then
   * left behind rather than brought back.
   */
  collections?: readonly string[];
}

/** A store kept in a file. */
export interface StorePersistence {
  /** Take the records the file holds into the store, replacing what each of those collections holds. */
  restore(): void;
  /** Save the store shortly: changes in quick succession are written once. */
  schedule(): void;
  /** Save what is not saved yet, at once. */
  flush(): Promise<void>;
}

/**
 * Keep a store in a file.
 *
 * A file that cannot be read as a store file is reported and left as it is
 * until the store is next saved over it; the store keeps what it held. A
 * save that fails is reported, and the next change tries again. Nothing is
 * written while the store holds what the file does.
 *
 * @param store - The store
 * @param options - The file, and which of its collections to restore
 * @returns The persistence the server drives
 * @example
 * ```ts
 * const persistence = createStorePersistence(server.store, { file: ".courier/mocks/users.json" });
 * persistence.restore();
 * ```
 */
export function createStorePersistence(
  store: MockStore,
  options: StorePersistOptions,
): StorePersistence {
  const { file } = options;
  let saved: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing: Promise<void> = Promise.resolve();

  function save(): Promise<void> {
    let text: string;
    try {
      text = storeFileText(store.snapshot());
    } catch (error) {
      log.warn(`The store could not be written as JSON to ${file}`, error);
      return writing;
    }
    if (text === saved) return writing;
    saved = text;
    writing = writing
      .then(() => writeStoreText(file, text))
      .catch((error: unknown) => {
        saved = null;
        log.warn(`The store could not be saved to ${file}`, error);
      });
    return writing;
  }

  return {
    restore() {
      const stored = readOrReport(file);
      if (stored === null) return;
      const keep = options.collections === undefined ? null : new Set(options.collections);
      for (const [name, records] of Object.entries(stored)) {
        if (keep === null || keep.has(name)) store.collection(name).seed(records);
      }
      saved = storeFileText(store.snapshot());
    },
    schedule() {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        void save();
      }, SAVE_DELAY_MS);
      timer.unref();
    },
    async flush() {
      clearTimeout(timer);
      timer = undefined;
      await save();
    },
  };
}

function readOrReport(file: string): ReturnType<typeof readStoreFile> {
  try {
    return readStoreFile(file);
  } catch (error) {
    log.warn(`The store starts from its seeds: ${file} could not be read`, error);
    return null;
  }
}
