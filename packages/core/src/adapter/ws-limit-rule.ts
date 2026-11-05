import { ConfigurationError } from "../errors";
import type { RefusalLog } from "../logger/refusal-log";
import { createMemoryConnectionLeases } from "../realtime/memory-leases";
import { clusterSecretOf } from "./ws-cluster-secret";
import { type ConnectionLimiter, createConnectionLimiter } from "./ws-connection-limit";
import type { WSHandlerConfig } from "./ws-types";

const OVERFLOWS: ReadonlySet<unknown> = new Set(["evict-oldest", "reject"]);
/** The most rules one handler applies to each connection it admits. */
const MAX_RULES = 8;

type Rule = Exclude<NonNullable<WSHandlerConfig["maxConnectionsPerKey"]>, readonly unknown[]>;

/**
 * The handler's limits on the connections of keys, their rules checked, in
 * the lease store it is given or this replica's memory.
 *
 * @param config - The handler's options
 * @param refusals - The handler's log of refusals
 * @returns The limiter, or undefined for a handler with no `maxConnectionsPerKey`
 * @throws ConfigurationError for no rule or more than 8, a rule with no key function, a `max` that
 *   is no whole number of 1 or more, an `onExceed` of neither kind, or rules on a handler with no
 *   `onConnect` to admit connections by
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
  const given = config.maxConnectionsPerKey;
  if (given === undefined) return undefined;
  const rules = isRuleList(given) ? given : [given];
  const problem = problemOf(rules, config.onConnect !== undefined);
  if (problem !== undefined) {
    throw new ConfigurationError(
      "CONNECTION_LIMIT_INVALID",
      `[courier] createWSHandler({ maxConnectionsPerKey }) ${problem}.`,
    );
  }
  return createConnectionLimiter({
    rules,
    store: config.connectionLeases ?? createMemoryConnectionLeases(),
    secret: clusterSecretOf(config.cluster, "createWSHandler"),
    refusals,
  });
}

function problemOf(rules: readonly Rule[], hasOnConnect: boolean): string | undefined {
  if (rules.length === 0 || rules.length > MAX_RULES) return `takes 1 to ${MAX_RULES} rules`;
  for (const [place, rule] of rules.entries()) {
    const which = rules.length === 1 ? "" : ` (rule ${place + 1})`;
    if (typeof rule?.key !== "function")
      return `takes a key function${which}, which reads a connection's key`;
    if (!Number.isInteger(rule.max) || rule.max < 1)
      return `takes a max that is a whole number, 1 or more${which}`;
    if (rule.onExceed !== undefined && !OVERFLOWS.has(rule.onExceed)) {
      return `takes an onExceed of "evict-oldest" or "reject"${which}`;
    }
  }
  if (!hasOnConnect)
    return "counts the connections onConnect admits, so the handler needs onConnect";
  return undefined;
}

function isRuleList(given: Rule | readonly Rule[]): given is readonly Rule[] {
  return Array.isArray(given);
}
