/**
 * Names an endpoint may not take: the key a group or a source keeps its own
 * settings under, beside its endpoints, and the accessors a client answers
 * to itself wherever an endpoint would sit (`raw`, `with`). The core refuses
 * an endpoint so named as its source loads, since no client could call it.
 */
export const RESERVED_ENDPOINT_NAMES: ReadonlySet<string> = new Set(["options", "raw", "with"]);

/**
 * Names a group may not take: the accessors a client answers to itself at
 * its root, which the core refuses a group by as its source loads.
 */
export const RESERVED_GROUP_NAMES: ReadonlySet<string> = new Set(["raw", "with"]);
