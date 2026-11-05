/**
 * How long one reading of a project's config may take before it is given
 * up, in milliseconds: a config that waits on the network, or on a timer,
 * never ends. The routes plugin's process and `courier-cli routes` hold to
 * it; Studio, which keeps running what it loaded last, has its own,
 * `COURIER_CONFIG_LOAD_TIMEOUT_MS`.
 */
export const CONFIG_READ_LIMIT_MS = 60_000;
