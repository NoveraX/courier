import { isRecord } from "../utils/is-record";
import { ownFields } from "../utils/own";

/**
 * What `.agent()` was given, as it was given, and where it was written.
 * Only a server reads it — an MCP server offering the endpoint as a tool —
 * and a server checks it as it takes the API up, with the message naming
 * where it was written; a page carries none of the checks.
 */
export interface AgentMark {
  /** The options, copied and frozen, or `false` */
  readonly given: unknown;
  /** The endpoint's address, such as `GET "orders/:id"` */
  readonly where: string;
}

/**
 * Keep what `.agent()` was given: frozen as it is, so a later change to the
 * object passed in cannot widen what the endpoint offers once a server has
 * checked it.
 *
 * @param given - What `.agent()` was given
 * @param where - The endpoint's address, for the message a server refuses it with
 * @returns The mark
 * @example
 * ```ts
 * agentMark({ description: "One order by its id", access: "read" }, 'GET "orders/:id"');
 * ```
 */
export function agentMark(given: unknown, where: string): AgentMark {
  return Object.freeze({ given: frozenCopy(given), where });
}

function frozenCopy(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const { limit } = ownFields(value);
  return Object.freeze({
    ...value,
    ...(isRecord(limit) && { limit: Object.freeze({ ...limit }) }),
  });
}
