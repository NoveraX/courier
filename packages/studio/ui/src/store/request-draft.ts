import type { RequestEntry } from "./types";

/**
 * The request list while a batch of events changes it.
 *
 * Entries are found by id through an index built once per batch, the list
 * is copied at most once, and new entries are gathered apart and put at the
 * head when the batch finishes: applying an event costs the same however
 * long the list is.
 */
export interface RequestDraft {
  /** Replace the entry with this id by what `change` makes of it; an unknown id changes nothing. */
  update: (id: string, change: (entry: RequestEntry) => RequestEntry) => void;
  /** Whether the list holds an entry with this id. */
  has: (id: string) => boolean;
  /** Put a new entry at the head of the list. */
  add: (entry: RequestEntry) => void;
  /**
   * The list the batch made, newest first and cut to `maxRequests` — the very
   * array it started from when nothing changed.
   */
  finish: (maxRequests: number) => { requests: RequestEntry[]; droppedCount: number };
}

/**
 * Start changing a request list.
 *
 * @param requests - The list as the store holds it, newest first; never mutated
 * @returns The draft to apply a batch of events to
 *
 * @example
 * ```ts
 * const draft = createRequestDraft(state.requests)
 * draft.update("r1", (r) => ({ ...r, status: "success" }))
 * const { requests, droppedCount } = draft.finish(2000)
 * ```
 */
export function createRequestDraft(requests: RequestEntry[]): RequestDraft {
  const added: RequestEntry[] = [];
  const addedAt = new Map<string, number>();
  let kept = requests;
  let keptAt: Map<string, number> | undefined;
  let changed = false;

  function indexOfKept(id: string): number | undefined {
    keptAt ??= indexById(requests);
    return keptAt.get(id);
  }

  return {
    update(id, change) {
      const newAt = addedAt.get(id);
      const addedEntry = newAt === undefined ? undefined : added[newAt];
      if (newAt !== undefined && addedEntry !== undefined) {
        added[newAt] = change(addedEntry);
        return;
      }
      const at = indexOfKept(id);
      const keptEntry = at === undefined ? undefined : kept[at];
      if (at === undefined || keptEntry === undefined) return;
      if (kept === requests) kept = requests.slice();
      kept[at] = change(keptEntry);
      changed = true;
    },
    has: (id) => addedAt.has(id) || indexOfKept(id) !== undefined,
    add(entry) {
      addedAt.set(entry.id, added.length);
      added.push(entry);
      changed = true;
    },
    finish(maxRequests) {
      if (!changed) return { requests, droppedCount: 0 };
      const next = added.length === 0 ? kept : added.reverse().concat(kept);
      const droppedCount = Math.max(0, next.length - maxRequests);
      return { requests: droppedCount > 0 ? next.slice(0, maxRequests) : next, droppedCount };
    },
  };
}

/** Where each id sits; the newest entry wins when an id repeats. */
function indexById(requests: RequestEntry[]): Map<string, number> {
  const at = new Map<string, number>();
  for (const [i, request] of requests.entries()) if (!at.has(request.id)) at.set(request.id, i);
  return at;
}
