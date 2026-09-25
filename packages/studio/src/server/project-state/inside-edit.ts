import { AsyncLocalStorage } from "node:async_hooks";

/** The mark an edit carries; `running` turns false once the edit returns. */
export interface EditMark {
  running: boolean;
}

/**
 * Holds the mark of the edit running on the reload chain, for the edit and
 * everything it awaits. Catching up with the disk waits for the chain, which
 * the edit holds until it returns; a read that caught up from inside an edit
 * would wait for itself. The read looks here first and refuses while the
 * mark is `running`.
 *
 * A callback the edit schedules keeps the mark after the edit returns — a
 * timer, a listener — so the engine clears `running` when the edit ends,
 * and such a callback may then catch up like any other reader. What an edit
 * applies, and a reload it asks for, outlive it; the engine runs them
 * outside this store, so the watches and reloads they start are not taken
 * for part of the edit.
 *
 * @example
 * ```ts
 * if (insideEdit.getStore()?.running) throw new ProjectStateError("FRESH_INSIDE_EDIT", message);
 * const mark: EditMark = { running: true };
 * try {
 *   await insideEdit.run(mark, () => transaction(ctx));
 * } finally {
 *   mark.running = false;
 * }
 * ```
 */
export const insideEdit = new AsyncLocalStorage<EditMark>();
