/**
 * The schema of Studio's database, brought up to date step by step. Each
 * step runs once, in a transaction, and the database records how many have
 * run in its `user_version`.
 */

import type { DatabaseSync } from "node:sqlite";

/* Append only: a step, once released, is never edited, since a database
   that already ran it will not run it again. */
const STEPS: readonly string[] = [
  `CREATE TABLE requests (
     id TEXT PRIMARY KEY,
     position INTEGER NOT NULL,
     open INTEGER NOT NULL,
     events INTEGER NOT NULL
   );
   CREATE INDEX requests_position ON requests (position);
   CREATE TABLE request_events (
     seq INTEGER PRIMARY KEY,
     request_id TEXT NOT NULL,
     body TEXT NOT NULL
   );
   CREATE INDEX request_events_request ON request_events (request_id, seq);`,
  `CREATE TABLE sessions (
     id TEXT PRIMARY KEY,
     saved_at INTEGER NOT NULL,
     body TEXT NOT NULL
   );
   CREATE INDEX sessions_saved_at ON sessions (saved_at);
   CREATE TABLE studio_state (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
  `CREATE TABLE mock_events (
     seq INTEGER PRIMARY KEY,
     request_id TEXT NOT NULL,
     body TEXT NOT NULL
   );
   CREATE INDEX mock_events_request ON mock_events (request_id);`,
];

/** A database a newer Studio made, which this one cannot read. */
export class NewerSchemaError extends Error {
  constructor(found: number) {
    super(
      `Studio's database was made by a newer Studio (schema ${found}, this one knows ${STEPS.length})`,
    );
    this.name = "NewerSchemaError";
  }
}

/**
 * Bring a database's schema up to date.
 *
 * @param db - The database
 * @throws NewerSchemaError when a newer Studio made it
 * @example
 * ```ts
 * migrate(new DatabaseSync(".courier/studio.db"));
 * ```
 */
export function migrate(db: DatabaseSync): void {
  const found = Number(db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
  if (found > STEPS.length) throw new NewerSchemaError(found);
  for (const [index, step] of STEPS.entries()) {
    if (index < found) continue;
    db.exec("BEGIN");
    try {
      db.exec(step);
      db.exec(`PRAGMA user_version = ${index + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
