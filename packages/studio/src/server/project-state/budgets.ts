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
