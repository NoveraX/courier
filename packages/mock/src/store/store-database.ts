/**
 * The SQLite file a mock store is kept in.
 *
 * Courier owns the schema and keeps its version in the file's
 * `user_version`; a file is brought to the current version as it opens, so
 * nothing is ever migrated by hand. A record is kept as a JSON document, so an
 * API whose shapes change needs no migration either.
 */

import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import type * as Sqlite from "node:sqlite";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { loadSqlite } from "./sqlite-module";
import { migrateStore } from "./store-schema";

/* SQLite's own result codes for a file that holds no database, or a damaged one. */
const SQLITE_CORRUPT = 11;
const SQLITE_NOTADB = 26;

/** A record as the file keeps it. */
export interface StoredRow {
  /** Which record of its collection it is, for as long as the record lives. */
  row: number;
  /** Where it stands in its collection. */
  position: number;
  /** The record, as JSON. */
  data: string;
}

/** What one save changes, applied in one transaction. */
export interface StoreChanges {
  added: readonly string[];
  removed: readonly string[];
  upserts: ReadonlyArray<StoredRow & { collection: string }>;
  deletes: ReadonlyArray<{ collection: string; row: number }>;
}

/** An open store file. */
export interface StoreDatabase {
  /** Every collection the file holds, empty ones included, each with its records in order. */
  read(): Map<string, StoredRow[]>;
  /** Apply the changes, all of them or, when one fails, none. */
  write(changes: StoreChanges): void;
  close(): void;
}

/** The open file, with what was done to open it; or why it could not be. */
export type OpenedStore = { database: StoreDatabase; note: string | null } | { refusal: string };

function errcodeOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("errcode" in error)) return null;
  return typeof error.errcode === "number" ? error.errcode & 0xff : null;
}

function columnOf(row: Record<string, SQLOutputValue>, column: string): string | number {
  const value = row[column];
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  throw new Error(`The store file holds no value in its ${column} column`);
}

function bind(db: DatabaseSync): StoreDatabase {
  const collections = db.prepare("SELECT name FROM collections");
  const rows = db.prepare(
    "SELECT collection, row, position, data FROM records ORDER BY collection, position, row",
  );
  const add = db.prepare("INSERT OR IGNORE INTO collections (name) VALUES (?)");
  const remove = db.prepare("DELETE FROM collections WHERE name = ?");
  const drop = db.prepare("DELETE FROM records WHERE collection = ? AND row = ?");
  const upsert = db.prepare(
    `INSERT INTO records (collection, row, position, data) VALUES (?, ?, ?, ?)
     ON CONFLICT (collection, row) DO UPDATE SET position = excluded.position, data = excluded.data`,
  );
  return {
    read() {
      const held = new Map<string, StoredRow[]>();
      for (const found of collections.all()) held.set(String(columnOf(found, "name")), []);
      for (const found of rows.all()) {
        held.get(String(columnOf(found, "collection")))?.push({
          row: Number(columnOf(found, "row")),
          position: Number(columnOf(found, "position")),
          data: String(columnOf(found, "data")),
        });
      }
      return held;
    },
    write({ added, removed, upserts, deletes }) {
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const name of removed) remove.run(name);
        for (const name of added) add.run(name);
        for (const { collection, row } of deletes) drop.run(collection, row);
        for (const r of upserts) upsert.run(r.collection, r.row, r.position, r.data);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      /* The room the deleted rows took goes back to the disk. */
      if (removed.length + deletes.length > 0) db.exec("PRAGMA incremental_vacuum");
    },
    close: () => db.close(),
  };
}

/* SQLite's mode that gives freed pages back to the disk when asked. */
const INCREMENTAL = 2;

/* A store made before is set to give back the room its deleted rows took,
   and compacted, once: a reset or a clear otherwise left the file at its
   largest. */
function giveBackFreedRoom(db: DatabaseSync): void {
  if (Number(db.prepare("PRAGMA auto_vacuum").get()?.auto_vacuum) === INCREMENTAL) return;
  db.exec("PRAGMA auto_vacuum = INCREMENTAL");
  db.exec("VACUUM");
}

/* A damaged file is kept beside, under a name that says so, with its journal. */
function setAside(file: string): string {
  const aside = `${file}.unreadable-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  renameSync(file, aside);
  if (existsSync(`${file}-journal`)) renameSync(`${file}-journal`, `${aside}-journal`);
  return aside;
}

type Attempt =
  | { kind: "opened"; database: StoreDatabase }
  | { kind: "refused"; refusal: string }
  | { kind: "damaged" };

/* One try at the file. An error SQLite gives for a file that holds no
   database, or a damaged one, says so; any other is thrown. */
function attempt(sqlite: typeof Sqlite, file: string): Attempt {
  let db: DatabaseSync | undefined;
  try {
    db = new sqlite.DatabaseSync(file);
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    const refusal = migrateStore(db);
    if (refusal !== null) {
      db.close();
      return { kind: "refused", refusal };
    }
    if (db.prepare("PRAGMA quick_check").get()?.quick_check !== "ok") {
      db.close();
      return { kind: "damaged" };
    }
    giveBackFreedRoom(db);
    return { kind: "opened", database: bind(db) };
  } catch (error) {
    db?.close();
    const code = errcodeOf(error);
    if (code === SQLITE_NOTADB || code === SQLITE_CORRUPT) return { kind: "damaged" };
    throw error;
  }
}

/**
 * Open the store file, creating it and its folder when missing, and bring its
 * schema to the current version.
 *
 * A file that holds no database, or a damaged one, is set aside and a new one
 * started; one written by a newer Courier is left as it is and refused.
 *
 * @param file - The file
 * @returns The open file, or why it could not be opened
 * @throws The error SQLite gives when the file cannot be opened at all — no
 *   permission to it, or another process holding it past the busy timeout
 * @example
 * ```ts
 * const opened = await openStoreDatabase(".courier/mocks/users.sqlite");
 * if ("database" in opened) opened.database.read();
 * ```
 */
export async function openStoreDatabase(file: string): Promise<OpenedStore> {
  const sqlite = await loadSqlite();
  if (sqlite === null)
    return { refusal: "this runtime has no node:sqlite; Node 22.13 or later has it" };
  mkdirSync(dirname(file), { recursive: true });
  const first = attempt(sqlite, file);
  if (first.kind === "opened") return { database: first.database, note: null };
  if (first.kind === "refused") return { refusal: first.refusal };
  const aside = setAside(file);
  const second = attempt(sqlite, file);
  if (second.kind === "opened") {
    return { database: second.database, note: `it could not be read, and was kept as ${aside}` };
  }
  return {
    refusal: second.kind === "refused" ? second.refusal : "a new file there cannot be read either",
  };
}
