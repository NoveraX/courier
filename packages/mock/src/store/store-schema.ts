/**
 * The schema of a mock store file, and how a file is brought to it.
 *
 * The version a file is at is its `user_version`; each step below takes a
 * file from one version to the next, in a transaction of its own, so a file
 * from any earlier Courier opens as a current one and a step that fails
 * leaves the file as it was.
 */

import type { DatabaseSync } from "node:sqlite";

/** The schema, one step per version: applying step n takes a file from version n to n + 1. */
export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE collections (name TEXT PRIMARY KEY) WITHOUT ROWID;
   CREATE TABLE records (
     collection TEXT NOT NULL REFERENCES collections (name) ON DELETE CASCADE,
     row INTEGER NOT NULL,
     position INTEGER NOT NULL,
     data TEXT NOT NULL,
     PRIMARY KEY (collection, row)
   ) WITHOUT ROWID;
   CREATE INDEX records_in_order ON records (collection, position);`,
];

/**
 * Bring an open store file to the current schema.
 *
 * @param db - The open file
 * @returns Why the file may not be used — a newer Courier wrote it — or `null`
 * @example
 * ```ts
 * const refusal = migrateStore(db);
 * if (refusal !== null) db.close();
 * ```
 */
export function migrateStore(db: DatabaseSync): string | null {
  const found = db.prepare("PRAGMA user_version").get()?.user_version;
  const version = typeof found === "number" ? found : Number(found ?? 0);
  if (version > MIGRATIONS.length) {
    return `it was written by a newer Courier (schema ${version}; this one knows ${MIGRATIONS.length})`;
  }
  for (let step = version; step < MIGRATIONS.length; step += 1) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATIONS[step] ?? "");
      db.exec(`PRAGMA user_version = ${step + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return null;
}
