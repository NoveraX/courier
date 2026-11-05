import { ConfigurationError } from "../errors";
import type { RefusalLog } from "../logger/refusal-log";
import { createMemoryConnectionLeases } from "../realtime/memory-leases";
import { clusterSecretOf } from "./ws-cluster-secret";
import { type ConnectionLimiter, createConnectionLimiter } from "./ws-connection-limit";
import type { WSHandlerConfig } from "./ws-types";

const OVERFLOWS: ReadonlySet<unknown> = new Set(["evict-oldest", "reject"]);

/**
 * The handler's limit on the connections of one key, its rule checked, in
 * the lease store it is given or this replica's memory.
 *
 * @param config - The handler's options
 * @param refusals - The handler's log of refusals
 * @returns The limiter, or undefined for a handler with no `maxConnectionsPerKey`
 * @throws ConfigurationError for a rule with no key function, a `max` that is no whole number of
 *   1 or more, an `onExceed` of neither kind, or one on a handler with no `onConnect` to read keys from
 *
 * @example
 * ```ts
 * const limiter = connectionLimitOf(config, refusals);
 * ```
 */
export function connectionLimitOf(
  config: WSHandlerConfig,
  refusals: RefusalLog,
): ConnectionLimiter | undefined {
  const rule = config.maxConnectionsPerKey;
  if (rule === undefined) return undefined;
  const problem = problemOf(rule, config.onConnect !== undefined);
  if (problem !== undefined) {
    throw new ConfigurationError(
      "CONNECTION_LIMIT_INVALID",
      `[courier] createWSHandler({ maxConnectionsPerKey }) ${problem}.`,
    );
  }
  return createConnectionLimiter({
    rule,
    store: config.connectionLeases ?? createMemoryConnectionLeases(),
    secret: clusterSecretOf(config),
    refusals,
  });
}

function problemOf(
  rule: NonNullable<WSHandlerConfig["maxConnectionsPerKey"]>,
  hasOnConnect: boolean,
) {
  if (typeof rule.key !== "function")
    return "takes a key function, which reads the key from a connection's metadata";
  if (!Number.isInteger(rule.max) || rule.max < 1)
    return "takes a max that is a whole number, 1 or more";
  if (rule.onExceed !== undefined && !OVERFLOWS.has(rule.onExceed)) {
    return 'takes an onExceed of "evict-oldest" or "reject"';
  }
  if (!hasOnConnect)
    return "reads its key from what onConnect returns, so the handler needs onConnect";
  return undefined;
}
