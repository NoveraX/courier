import type { AgentMark } from "@/features/apis/types";

/**
 * What an endpoint's agent mark says in a sentence — the tool it is offered
 * as, what a call does, whether a person confirms each call, and why — for
 * the tag on its row and the hint on its definition.
 *
 * @param mark - What the project's `agents` policy decided for the endpoint
 * @returns The sentence
 * @example
 * ```ts
 * agentMarkTitle({ offered: true, tool: "orders_get", access: "read", confirm: false, reason: 'offer: "reads"' });
 * // 'Offered to agents as orders_get: read — offer: "reads"'
 * ```
 */
export function agentMarkTitle(mark: AgentMark): string {
  if (!mark.offered) return `Not offered to agents — ${mark.reason}`;
  const confirms = mark.confirm ? ", a person confirms each call" : "";
  return `Offered to agents as ${mark.tool ?? "a tool"}: ${mark.access ?? "read"}${confirms} — ${mark.reason}`;
}
