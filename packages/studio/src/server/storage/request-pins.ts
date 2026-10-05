import type { DatabaseSync } from "node:sqlite";

const KEY = "requests.pinned";

/** The requests pinned on Studio's pages, kept with the log. */
export interface RequestPins {
  /** The pinned requests' ids. */
  ids(): string[];
  has(id: string): boolean;
  /** Pin a request, or unpin it. */
  set(id: string, pinned: boolean): void;
  /** Keep only the pins of the requests named: the others' requests are gone. */
  retain(keep: ReadonlySet<string>): void;
}

/**
 * The requests pinned on Studio's pages, kept in the project's database so
 * a page that reloads, another browser, or a Studio that restarts shows
 * them pinned — and the log keeps them as it lets its oldest requests go.
 *
 * @param db - Studio's database
 * @returns The pins
 * @example
 * ```ts
 * const pins = createRequestPins(db);
 * pins.set("req_1", true);
 * pins.ids(); // ["req_1"]
 * ```
 */
export function createRequestPins(db: DatabaseSync): RequestPins {
  const select = db.prepare("SELECT value FROM studio_state WHERE key = ?");
  const upsert = db.prepare("INSERT OR REPLACE INTO studio_state (key, value) VALUES (?, ?)");
  const stored: unknown = JSON.parse(String(select.get(KEY)?.value ?? "[]"));
  const pinned = new Set(
    Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [],
  );
  const save = () => upsert.run(KEY, JSON.stringify([...pinned]));
  return {
    ids: () => [...pinned],
    has: (id) => pinned.has(id),
    set(id, on) {
      if (on === pinned.has(id)) return;
      if (on) pinned.add(id);
      else pinned.delete(id);
      save();
    },
    retain(keep) {
      const before = pinned.size;
      for (const id of pinned) if (!keep.has(id)) pinned.delete(id);
      if (pinned.size !== before) save();
    },
  };
}
