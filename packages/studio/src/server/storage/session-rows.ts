/**
 * The sessions saved in Studio's database, whole, each checked as it is
 * read back: the database is a file in the project, and a session that is
 * not one is left out rather than shown.
 */

import type { DatabaseSync } from "node:sqlite";

import { readSavedSession } from "../session-guard";
import type { SavedSession, SessionSummary } from "../session-types";

/** The saved sessions */
export interface SessionStore {
  save(session: SavedSession): void;
  /** The session, or `null` when there is none by that id */
  load(id: string): SavedSession | null;
  /** Whether there was one to delete */
  remove(id: string): boolean;
  /** Every session, newest first, without its requests */
  list(): SessionSummary[];
  /** Delete every session; how many there were */
  clear(): number;
}

/**
 * The saved sessions in a database.
 *
 * @param db - Studio's database
 * @returns The sessions
 * @example
 * ```ts
 * const sessions = createSessionStore(db);
 * sessions.save(buildSession({ name: "login flow", requests, apps: [] }));
 * ```
 */
export function createSessionStore(db: DatabaseSync): SessionStore {
  const insert = db.prepare(
    "INSERT OR REPLACE INTO sessions (id, saved_at, body) VALUES (?, ?, ?)",
  );
  const select = db.prepare("SELECT body FROM sessions WHERE id = ?");
  const remove = db.prepare("DELETE FROM sessions WHERE id = ?");
  const selectAll = db.prepare("SELECT body FROM sessions ORDER BY saved_at DESC");
  const removeAll = db.prepare("DELETE FROM sessions");

  return {
    save(session) {
      insert.run(session.id, session.savedAt, JSON.stringify(session));
    },
    load(id) {
      const body = select.get(id)?.body;
      return typeof body === "string" ? readSavedSession(body) : null;
    },
    remove(id) {
      return Number(remove.run(id).changes) > 0;
    },
    list() {
      return selectAll.all().flatMap((row): SessionSummary[] => {
        const session = typeof row.body === "string" ? readSavedSession(row.body) : null;
        if (!session) return [];
        const { id, name, savedAt, startedAt, duration, stats, apps } = session;
        return [{ id, name, savedAt, startedAt, duration, stats, appCount: apps.length }];
      });
    },
    clear() {
      return Number(removeAll.run().changes);
    },
  };
}
