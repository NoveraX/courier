import type { DatabaseSync, StatementSync } from "node:sqlite";

import { isPlainObject } from "../is-plain-object";
import { withoutCredentials } from "./without-credentials";

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

/* What was typed in the Playground, the credentials in its headers among it. */
const DRAFTS: PageStateKey = "playground.drafts";

/** What the pages keep in the project's database, and what changes it. */
export interface PageState {
  /**
   * Every value kept, by its name: the drafts as this Studio's pages typed
   * them, while the database holds what was written of them.
   */
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
 * drafts, the mock wizard and the API import left unfinished. Each is kept
 * under a name of its own and read back as each page connects. The drafts
 * are written down as the Playground's history is, each credential in their
 * headers kept by name with its value replaced, and drafts an earlier Studio
 * wrote down whole are written down so as this one starts. This Studio holds
 * them as its pages typed them, and has them so while the database holds
 * what it wrote: a page that reloads, or another browser, has the credential,
 * and a Studio that restarts, or one that has since written other drafts, has
 * `[redacted]` in its place.
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
  /* Each value written down with something cut, as a page set it, beside the text written. */
  const whole = new Map<PageStateKey, { written: string; value: unknown }>();
  cutDraftsKeptWhole(db, upsert);
  return {
    read() {
      const kept: Partial<Record<PageStateKey, unknown>> = {};
      for (const row of selectAll.all()) {
        const key = String(row.key).slice(PREFIX.length);
        if (!isPageStateKey(key) || typeof row.value !== "string") continue;
        const held = whole.get(key);
        kept[key] = held?.written === row.value ? held.value : JSON.parse(row.value);
      }
      return kept;
    },
    write(key, value): key is PageStateKey {
      if (!isPageStateKey(key)) return false;
      if (!isPlainObject(value) && typeof value !== "boolean") return false;
      const text = JSON.stringify(value);
      if (Buffer.byteLength(text) > MAX_VALUE_BYTES) return false;
      const written = key === DRAFTS ? JSON.stringify(withoutCredentials(value)) : text;
      upsert.run(`${PREFIX}${key}`, written);
      if (written === text) whole.delete(key);
      else whole.set(key, { written, value });
      return true;
    },
  };
}

/* Drafts an earlier Studio wrote down whole are written down again without their credentials. */
function cutDraftsKeptWhole(db: DatabaseSync, upsert: StatementSync): void {
  const key = `${PREFIX}${DRAFTS}`;
  const row = db.prepare("SELECT value FROM studio_state WHERE key = ?").get(key);
  if (typeof row?.value !== "string") return;
  const cut = JSON.stringify(withoutCredentials(JSON.parse(row.value)));
  if (cut !== row.value) upsert.run(key, cut);
}
