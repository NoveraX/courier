import type { DatabaseSync } from "node:sqlite";

/* SQLite's mode that gives freed pages back to the disk when asked. */
const INCREMENTAL = 2;

/* Freed pages are given back once they come to this much, not after every write. */
const TRIM_FREE_BYTES = 8 * 1024 * 1024;

function pragma(db: DatabaseSync, name: string): number {
  return Number(Object.values(db.prepare(`PRAGMA ${name}`).get() ?? {})[0] ?? 0);
}

/**
 * Make a database give the room its deleted rows took back to the disk: a
 * new one is set to, and one made before is set to and compacted, once. The
 * logs let their oldest requests go all the time, and without this the
 * file kept every byte it ever held.
 *
 * @param db - Studio's database
 * @returns Whether the database was compacted now
 * @example
 * ```ts
 * if (giveBackFreedRoom(db)) log.info("Compacted studio.db once");
 * ```
 */
export function giveBackFreedRoom(db: DatabaseSync): boolean {
  if (pragma(db, "auto_vacuum") === INCREMENTAL) return false;
  db.exec("PRAGMA auto_vacuum = INCREMENTAL");
  compactDb(db);
  return true;
}

/**
 * Give the room freed inside the database back to the disk, once it comes
 * to enough to matter.
 *
 * @param db - Studio's database
 * @example
 * ```ts
 * setInterval(() => trimFreedRoom(db), 60_000).unref();
 * ```
 */
export function trimFreedRoom(db: DatabaseSync): void {
  if (pragma(db, "freelist_count") * pragma(db, "page_size") < TRIM_FREE_BYTES) return;
  db.exec("PRAGMA incremental_vacuum");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
}

/**
 * Rewrite the database at its smallest, its write-ahead log emptied: after a
 * clear, so the disk gets back what it freed.
 *
 * @param db - Studio's database
 * @example
 * ```ts
 * clearKinds(["requests"]);
 * compactDb(db);
 * ```
 */
export function compactDb(db: DatabaseSync): void {
  db.exec("VACUUM");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
}
