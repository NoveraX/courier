import { budgetFromEnv } from "./budget-from-env";

/** The environment variable that sets {@link CONFIG_LOAD_TIMEOUT_MS}. */
export const CONFIG_LOAD_TIMEOUT_VARIABLE = "COURIER_CONFIG_LOAD_TIMEOUT_MS";

/**
 * How long one load of the project may take before Studio gives up waiting
 * for it: the first load, each reload, and the load an edit makes. 20 s,
 * unless `COURIER_CONFIG_LOAD_TIMEOUT_MS` holds another whole number of
 * milliseconds when Studio starts.
 */
export const CONFIG_LOAD_TIMEOUT_MS = budgetFromEnv(CONFIG_LOAD_TIMEOUT_VARIABLE, 20_000);

/**
 * How long a read that only shows the project waits for Studio to catch up
 * with the disk before it answers with what Studio runs: a list or a
 * preview left waiting longer behind a slow load or an edit is worse than
 * one that describes the project a moment before.
 */
export const SHOW_BUDGET_MS = 3_000;

/**
 * How long a request that acts on the project — writing files from it, or
 * holding the reload chain for an edit — waits for Studio to catch up or
 * for the chain to be free before it refuses. Longer than one load may take
 * (`CONFIG_LOAD_TIMEOUT_MS`), so a request queued behind a load that hangs
 * is served once Studio gives that load up, rather than refused while the
 * next load is about to run; it follows `COURIER_CONFIG_LOAD_TIMEOUT_MS`.
 */
export const ACT_BUDGET_MS = CONFIG_LOAD_TIMEOUT_MS + 5_000;
