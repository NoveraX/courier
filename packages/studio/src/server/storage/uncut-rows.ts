/**
 * The events a log kept with no text for a page without the project's
 * token beside them — every event, until such a page is first sent it, and
 * those a Studio before the database kept that text wrote — cut before any
 * such page is sent the log, each once: writing an event cuts nothing, so a
 * Studio no such page connects to spends nothing on it.
 */

import type { DatabaseSync } from "node:sqlite";

import { keptWithoutSecrets } from "../event-without-secrets";

/**
 * What gives each event a log kept so its text for a page without the token.
 *
 * @param db - Studio's database
 * @param table - The log's table of events
 * @returns A function that cuts them, at the cost of one look when there are none
 * @example
 * ```ts
 * const cutUncut = uncutRows(db, "mock_events");
 * cutUncut();
 * ```
 */
export function uncutRows(db: DatabaseSync, table: "request_events" | "mock_events"): () => void {
  const uncut = db.prepare(`SELECT seq, body FROM ${table} WHERE shown IS NULL`);
  const cut = db.prepare(`UPDATE ${table} SET shown = ? WHERE seq = ?`);
  return () => {
    const rows = uncut.all();
    if (rows.length === 0) return;
    db.exec("BEGIN");
    try {
      for (const row of rows) cut.run(keptWithoutSecrets(String(row.body)), Number(row.seq));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
}
