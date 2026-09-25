import { CONFIG_LOAD_TIMEOUT_MS } from "../project-state/budgets";

/**
 * How long an edit waits for the reload chain to be free before it tells the
 * wizard Studio is busy, rather than leaving the request unanswered behind
 * loads that keep it taken. Longer than one load may take, so an edit queued
 * behind a load that hangs runs once Studio gives that load up.
 */
export const SLOT_WAIT_MS = CONFIG_LOAD_TIMEOUT_MS + 5_000;

/*
 * How long a preview waits for a save the watcher has seen but not yet
 * loaded, so the plan describes the file as it is.
 */
export const SETTLE_BUDGET_MS = 2_000;

/**
 * How long Studio, when it stops, lets an edit under way finish: its load,
 * which may take `CONFIG_LOAD_TIMEOUT_MS`, and the undo that may follow it.
 */
export const EDIT_FINISH_BUDGET_MS = CONFIG_LOAD_TIMEOUT_MS + 5_000;
