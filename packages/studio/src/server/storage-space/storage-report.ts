import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { COURIER_DIR } from "../courier-dir";
import { MAX_REQUESTS } from "../request-log";
import { MOCK_LOG_REQUESTS } from "../storage/mock-log";
import { databaseOnDisk } from "./database-size";
import { folderSize } from "./folder-size";
import type { StorageKind } from "./storage-kinds";

/** How much one of what Studio keeps takes, how many it holds, and how many it keeps at most. */
export interface KindReport {
  kind: StorageKind;
  bytes: number;
  count: number;
  limit?: number | undefined;
}

/** What Studio keeps in `.courier/` and how much room it takes. */
export interface StorageReport {
  /** The folder, as the project names it. */
  folder: string;
  /** Whether the database is on disk; `false` when Studio keeps it in memory for this run. */
  persistent: boolean;
  /** The database's files on disk, the bytes its data takes, and the bytes freed inside it. */
  database: { onDisk: number; data: number; free: number };
  kinds: KindReport[];
}

function pragma(db: DatabaseSync, name: string): number {
  return Number(Object.values(db.prepare(`PRAGMA ${name}`).get() ?? {})[0] ?? 0);
}

function rows(db: DatabaseSync, sql: string): { bytes: number; count: number } {
  const row = db.prepare(sql).get() ?? {};
  return { bytes: Number(row.bytes ?? 0), count: Number(row.count ?? 0) };
}

/* The bytes of a table's rows, as SQLite stores their text. */
const BODY_BYTES = "COALESCE(SUM(LENGTH(CAST(body AS BLOB))), 0)";
/* A field seen in answers: its place, its type, its hosts, and the numbers beside them. */
const FIELD_BYTES =
  "COALESCE(SUM(LENGTH(CAST(path AS BLOB)) + LENGTH(type) + LENGTH(CAST(places AS BLOB)) + 24), 0)";

/* Each kind kept in the database: its rows' bytes, and how many it holds. */
function databaseKinds(db: DatabaseSync): KindReport[] {
  const requests = rows(
    db,
    `SELECT (SELECT COUNT(*) FROM requests) AS count, ${BODY_BYTES} AS bytes FROM request_events`,
  );
  const mockLogs = rows(
    db,
    `SELECT COUNT(DISTINCT request_id) AS count, ${BODY_BYTES} AS bytes FROM mock_events`,
  );
  const playground = db
    .prepare("SELECT value FROM studio_state WHERE key = 'playground.history'")
    .get();
  const entries: unknown =
    typeof playground?.value === "string" ? JSON.parse(playground.value) : [];
  const sessions = rows(db, `SELECT COUNT(*) AS count, ${BODY_BYTES} AS bytes FROM sessions`);
  const observations = rows(
    db,
    `SELECT (SELECT COUNT(*) FROM answered_calls) AS count, ${FIELD_BYTES} AS bytes FROM answer_fields`,
  );
  return [
    { kind: "requests", ...requests, limit: MAX_REQUESTS },
    { kind: "mockLogs", ...mockLogs, limit: MOCK_LOG_REQUESTS },
    {
      kind: "playground",
      bytes: typeof playground?.value === "string" ? Buffer.byteLength(playground.value) : 0,
      count: Array.isArray(entries) ? entries.length : 0,
    },
    { kind: "sessions", ...sessions },
    { kind: "observations", ...observations },
  ];
}

/**
 * What Studio keeps in `.courier/` and how much room each part takes: the
 * database's files on disk and the data in them, the captured requests,
 * the mocks' logs, the Playground's history, the saved sessions, the mocks'
 * stores and the backups of the files imports replaced.
 *
 * @param db - Studio's database
 * @param persistent - Whether the database is on disk
 * @param root - The project Studio serves
 * @returns The report
 * @example
 * ```ts
 * storageReport(storage.db, storage.persistent, root).database.onDisk; // 214_958_080
 * ```
 */
export function storageReport(db: DatabaseSync, persistent: boolean, root: string): StorageReport {
  const courier = join(root, COURIER_DIR);
  const pageSize = pragma(db, "page_size");
  const free = pragma(db, "freelist_count") * pageSize;
  const onDisk = databaseOnDisk(root, persistent);
  const stores = folderSize(join(courier, "mocks"), (name) => /\.sqlite(-wal|-shm)?$/.test(name));
  const storeFiles = folderSize(join(courier, "mocks"), (name) => name.endsWith(".sqlite"));
  const backups = folderSize(join(courier, "backups"));
  return {
    folder: COURIER_DIR,
    persistent,
    database: { onDisk, data: pragma(db, "page_count") * pageSize - free, free },
    kinds: [
      ...databaseKinds(db),
      { kind: "mockStores", bytes: stores.bytes, count: storeFiles.entries },
      { kind: "backups", bytes: backups.bytes, count: backups.entries },
    ],
  };
}
