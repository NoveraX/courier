import type { DatabaseSync } from "node:sqlite";

import { isPlainObject } from "../is-plain-object";

/** What a page keeps in the project, each under its own name. */
export const PAGE_STATE_KEYS = [
  "settings",
  "setup",
  "playground.drafts",
  "mocks.wizard",
  "apis.import",
] as const;

/** One of what a page keeps in the project. */
export type PageStateKey = (typeof PAGE_STATE_KEYS)[number];

/* Settings and drafts are small; a value far larger is not a page's. */
const MAX_VALUE_BYTES = 256 * 1024;

const PREFIX = "page.";

/** What the pages keep in the project's database, and what changes it. */
export interface PageState {
  /** Every value kept, by its name. */
  read(): Partial<Record<PageStateKey, unknown>>;
  /**
   * Keep a value under its name; `false` for a name that is not a page's, or
   * a value too large or with no JSON.
   */
  write(key: unknown, value: unknown): key is PageStateKey;
}

export function isPageStateKey(value: unknown): value is PageStateKey {
  return typeof value === "string" && (PAGE_STATE_KEYS as readonly string[]).includes(value);
}

/**
 * What Studio's pages keep in the project's database rather than in one
 * browser: the settings, the progress of Get started, the Playground's
 * drafts, the mock wizard and the API import left unfinished. Each is kept under a name of its own,
 * whole, and read back as each page connects.
 *
 * @param db - Studio's database
 * @returns The page state
 * @example
 * ```ts
 * const pages = createPageState(db);
 * pages.write("settings", { theme: "light" });
 * pages.read().settings; // { theme: "light" }
 * ```
 */
export function createPageState(db: DatabaseSync): PageState {
  const selectAll = db.prepare("SELECT key, value FROM studio_state WHERE key LIKE 'page.%'");
  const upsert = db.prepare("INSERT OR REPLACE INTO studio_state (key, value) VALUES (?, ?)");
  return {
    read() {
      const kept: Partial<Record<PageStateKey, unknown>> = {};
      for (const row of selectAll.all()) {
        const key = String(row.key).slice(PREFIX.length);
        if (isPageStateKey(key) && typeof row.value === "string") kept[key] = JSON.parse(row.value);
      }
      return kept;
    },
    write(key, value): key is PageStateKey {
      if (!isPageStateKey(key)) return false;
      if (!isPlainObject(value) && typeof value !== "boolean") return false;
      const text = JSON.stringify(value);
      if (Buffer.byteLength(text) > MAX_VALUE_BYTES) return false;
      upsert.run(`${PREFIX}${key}`, text);
      return true;
    },
  };
}
