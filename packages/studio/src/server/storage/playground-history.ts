/**
 * The Playground's history of calls, kept in Studio's database for the
 * project rather than in one browser: a page that reloads, another browser,
 * or a Studio that restarts shows the calls made before. The page decides
 * what an entry holds and trims it; Studio keeps what it is given.
 */

import type { DatabaseSync } from "node:sqlite";

const KEY = "playground.history";

/** The Playground's history */
export interface PlaygroundHistory {
  /** The entries, newest first, as the page last gave them */
  entries(): unknown[];
  replace(entries: readonly unknown[]): void;
}

/**
 * The Playground's history, kept in a database.
 *
 * @param db - Studio's database
 * @returns The history
 * @example
 * ```ts
 * const history = createPlaygroundHistory(db);
 * socket.emit("playground:history", history.entries());
 * ```
 */
export function createPlaygroundHistory(db: DatabaseSync): PlaygroundHistory {
  const select = db.prepare("SELECT value FROM studio_state WHERE key = ?");
  const upsert = db.prepare("INSERT OR REPLACE INTO studio_state (key, value) VALUES (?, ?)");

  return {
    entries() {
      const value = select.get(KEY)?.value;
      const parsed: unknown = typeof value === "string" ? JSON.parse(value) : [];
      return Array.isArray(parsed) ? parsed : [];
    },
    replace(entries) {
      upsert.run(KEY, JSON.stringify(entries));
    },
  };
}
