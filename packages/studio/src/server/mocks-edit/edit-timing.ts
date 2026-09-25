import { CONFIG_LOAD_TIMEOUT_MS } from "../project-state/budgets";

/**
 * How long Studio, when it stops, lets an edit under way finish: its load,
 * which may take `CONFIG_LOAD_TIMEOUT_MS`, and the undo that may follow it.
 */
export const EDIT_FINISH_BUDGET_MS = CONFIG_LOAD_TIMEOUT_MS + 5_000;
