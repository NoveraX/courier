import type { AgentDecision } from "./agent-decision";
import type { CheckedPolicy } from "./checked-policy";

/**
 * Why the policy decided as it did for an endpoint, in the words its
 * config uses — what `courier-mcp --list`, Studio and the pull request
 * report show beside it.
 *
 * @param decision - The endpoint's decision
 * @param policy - The policy it was decided by
 * @returns The reason: `marked .agent()`, `denied by billing.**`
 * @example
 * ```ts
 * decisionReason({ offered: true, by: "offer", access: "read", confirm: false }, policy); // 'offer: "reads"'
 * ```
 */
export function decisionReason(decision: AgentDecision, policy: CheckedPolicy): string {
  switch (decision.by) {
    case "marked":
      return "marked .agent()";
    case "allow":
      return `allowed by ${decision.pattern ?? "a pattern"}`;
    case "offer":
      return `offer: "${policy.offer}"`;
    case "deny":
      return `denied by ${decision.pattern ?? "a pattern"}`;
    case "opted-out":
      return ".agent(false)";
    case "ceiling":
      return `${decision.access ?? "its access"} is beyond access: "${policy.access}"`;
    case "kind":
      return "a stream or a channel, which no tool can be";
    default:
      return policy.offer === "reads" ? "a write not marked .agent()" : "not marked .agent()";
  }
}
