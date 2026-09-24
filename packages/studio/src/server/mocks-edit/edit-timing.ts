/** How long the edited files may take to load before Studio takes the edit back. */
export const LOAD_TIMEOUT_MS = 20_000;

/**
 * How long an edit waits for the reload chain to be free before it tells the
 * wizard Studio is busy, rather than leaving the request unanswered behind a
 * load that does not finish.
 */
export const SLOT_WAIT_MS = 15_000;

/*
 * How long a preview waits for a save the watcher has seen but not yet
 * loaded, so the plan describes the file as it is.
 */
export const SETTLE_BUDGET_MS = 2_000;

/**
 * How long Studio, when it stops, lets an edit under way finish: its load,
 * and the undo that may follow it.
 */
export const EDIT_FINISH_BUDGET_MS = LOAD_TIMEOUT_MS + 5_000;
