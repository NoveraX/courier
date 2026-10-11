import type { AgentAccess } from "@noverax/courier";
import type { PlacedEndpoint } from "@noverax/courier/internal";

import type { AgentPattern } from "./agent-pattern";
import type { CheckedPolicy } from "./checked-policy";

/** What offered an endpoint to agents: its `.agent()`, an `allow` pattern, or the policy's `offer`. */
export type OfferedBy = "marked" | "allow" | "offer";

/**
 * What kept an endpoint from agents: a `deny` pattern, its `.agent(false)`,
 * access beyond the policy's `access`, nothing that offers it, or a kind of
 * endpoint no tool can be — a stream or a channel.
 */
export type KeptBy = "deny" | "opted-out" | "ceiling" | "unmarked" | "kind";

/** Whether an endpoint is offered to agents, what decided it, and — offered — how. */
export type AgentDecision =
  | {
      readonly offered: true;
      readonly by: OfferedBy;
      /** What a call does: as `.agent()` declared it, or as the verb implies. */
      readonly access: AgentAccess;
      /** Whether a person confirms each call. */
      readonly confirm: boolean;
      /** The `allow` pattern that offered it. */
      readonly pattern?: string | undefined;
    }
  | {
      readonly offered: false;
      readonly by: KeptBy;
      /** What a call would do, where the policy's `access` kept it out. */
      readonly access?: AgentAccess | undefined;
      /** The `deny` pattern that kept it out. */
      readonly pattern?: string | undefined;
    };

const RANK: Readonly<Record<AgentAccess, number>> = { read: 0, write: 1, destructive: 2 };

/**
 * What the policy decides for one endpoint, in its order — a `deny`
 * pattern, `.agent(false)`, the `access` ceiling, `.agent()`, an `allow`
 * pattern, `offer` — the first rule that speaks deciding it.
 *
 * @param endpoint - The endpoint, as its API places it
 * @param path - Its call under its source: `shop.orders.cancel`
 * @param policy - The project's policy, checked
 * @returns The decision
 * @example
 * ```ts
 * decideEndpoint(endpoint, "billing.invoices.void", policy); // { offered: false, by: "deny", pattern: "billing.**" }
 * ```
 */
export function decideEndpoint(
  endpoint: PlacedEndpoint,
  path: string,
  policy: CheckedPolicy,
): AgentDecision {
  if (endpoint.kind === "stream" || endpoint.kind === "channel")
    return { offered: false, by: "kind" };
  const denied = firstMatch(policy.deny, path);
  if (denied !== undefined) return { offered: false, by: "deny", pattern: denied };
  const marked = endpoint.options.agent;
  if (marked === false) return { offered: false, by: "opted-out" };
  const access = marked?.access ?? impliedAccess(endpoint);
  if (RANK[access] > RANK[policy.access]) return { offered: false, by: "ceiling", access };
  const confirm = RANK[access] >= RANK[policy.confirm];
  if (marked !== undefined) return { offered: true, by: "marked", access, confirm };
  const allowed = firstMatch(policy.allow, path);
  if (allowed !== undefined)
    return { offered: true, by: "allow", access, confirm, pattern: allowed };
  if (policy.offer === "all" || (policy.offer === "reads" && access === "read")) {
    return { offered: true, by: "offer", access, confirm };
  }
  return { offered: false, by: "unmarked" };
}

/**
 * What a call to an endpoint not marked `.agent()` does, as its verb
 * implies: a read for a query, `destructive` for DELETE, `write` for the
 * rest — what a person confirms follows from it.
 *
 * @param endpoint - The endpoint
 * @returns Its access
 * @example
 * ```ts
 * impliedAccess(placed); // "destructive" for a DELETE
 * ```
 */
export function impliedAccess(endpoint: PlacedEndpoint): AgentAccess {
  if (endpoint.kind === "query") return "read";
  return endpoint.method === "del" ? "destructive" : "write";
}

function firstMatch(patterns: readonly AgentPattern[], path: string): string | undefined {
  return patterns.find((pattern) => pattern.matches(path))?.text;
}
