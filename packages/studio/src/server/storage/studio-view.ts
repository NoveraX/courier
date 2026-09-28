/**
 * What Studio's pages show: the live requests, or a saved session one of
 * them loaded. Kept in Studio's database, so a page that reloads shows the
 * session it was looking at, not the live requests in its place.
 */

import type { DatabaseSync } from "node:sqlite";

const KEY = "view.session";

/** What the pages show */
export interface StudioView {
  /** The id of the saved session shown; none while the pages show the live requests */
  session(): string | undefined;
  /** Show a saved session */
  showSession(id: string): void;
  /** Show the live requests */
  showLive(): void;
}

/**
 * What the pages show, kept in a database.
 *
 * @param db - Studio's database
 * @returns The view
 * @example
 * ```ts
 * const view = createStudioView(db);
 * view.showSession("s_1790000000000_ab12");
 * ```
 */
export function createStudioView(db: DatabaseSync): StudioView {
  const select = db.prepare("SELECT value FROM studio_state WHERE key = ?");
  const upsert = db.prepare("INSERT OR REPLACE INTO studio_state (key, value) VALUES (?, ?)");
  const remove = db.prepare("DELETE FROM studio_state WHERE key = ?");

  return {
    session() {
      const value = select.get(KEY)?.value;
      return typeof value === "string" ? value : undefined;
    },
    showSession(id) {
      upsert.run(KEY, id);
    },
    showLive() {
      remove.run(KEY);
    },
  };
}
