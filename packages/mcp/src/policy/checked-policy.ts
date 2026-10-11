import { type AgentAccess, type AgentOffer, ConfigurationError } from "@noverax/courier";

import { isRecord } from "../is-record";
import { type AgentPattern, agentPattern } from "./agent-pattern";

/** The `agents` policy, checked, with every default it left out. */
export interface CheckedPolicy {
  readonly offer: AgentOffer;
  readonly allow: readonly AgentPattern[];
  readonly deny: readonly AgentPattern[];
  readonly access: AgentAccess;
  readonly confirm: Exclude<AgentAccess, "read">;
}

/** The policy of a project that sets none: the endpoints marked `.agent()`, and nothing else. */
export const MARKED_ONLY: CheckedPolicy = Object.freeze({
  offer: "marked",
  allow: [],
  deny: [],
  access: "destructive",
  confirm: "destructive",
});

const OFFERS: readonly AgentOffer[] = ["marked", "reads", "all"];
const ACCESSES: readonly AgentAccess[] = ["read", "write", "destructive"];
const CONFIRMS: readonly Exclude<AgentAccess, "read">[] = ["write", "destructive"];
const KEYS: ReadonlySet<string> = new Set(["offer", "allow", "deny", "access", "confirm"]);

/**
 * The config's `agents` policy, checked where the project is read, so a
 * misspelt key or an unknown value stops the server rather than offer more
 * — or less — than the project wrote.
 *
 * @param value - The config's `agents`, as written; absent, the endpoints marked `.agent()`
 * @returns The policy, its defaults filled in, frozen
 * @throws ConfigurationError `AGENT_POLICY_INVALID` when it cannot be decided by
 * @example
 * ```ts
 * checkedPolicy({ offer: "reads", deny: ["billing.**"] }).access; // "destructive"
 * ```
 */
export function checkedPolicy(value: unknown): CheckedPolicy {
  if (value === undefined) return MARKED_ONLY;
  if (!isRecord(value))
    throw invalid("agents", "takes an object: { offer, allow, deny, access, confirm }");
  const unknown = Object.keys(value).filter((key) => !KEYS.has(key));
  if (unknown.length > 0) {
    throw invalid("agents", `has no option ${unknown.map((key) => `"${key}"`).join(", ")}`);
  }
  return Object.freeze({
    offer: oneOf(value.offer, OFFERS, "marked", "agents.offer"),
    allow: patterns(value.allow, "agents.allow"),
    deny: patterns(value.deny, "agents.deny"),
    access: oneOf(value.access, ACCESSES, "destructive", "agents.access"),
    confirm: oneOf(value.confirm, CONFIRMS, "destructive", "agents.confirm"),
  });
}

/** What a server's start narrows its project's policy by: never wider than the project wrote. */
export interface Narrowing {
  /** Offer reads alone, whatever the policy's `access`. */
  readonly readOnly?: boolean | undefined;
  /** Patterns of endpoints to keep from agents as well as the policy's own. */
  readonly deny?: readonly string[] | undefined;
}

/**
 * A policy narrowed where a server starts — `courier-mcp --read-only`,
 * `--deny` — which can keep more from agents but never offer more than
 * the reviewed config does.
 *
 * @param policy - The project's policy, checked
 * @param narrowing - What the start narrows it by
 * @returns The narrower policy
 * @throws ConfigurationError `AGENT_POLICY_INVALID` for a `--deny` pattern that names nothing
 * @example
 * ```ts
 * narrowedPolicy(policy, { readOnly: true, deny: ["shop.users.*"] }).access; // "read"
 * ```
 */
export function narrowedPolicy(policy: CheckedPolicy, narrowing: Narrowing): CheckedPolicy {
  const deny = (narrowing.deny ?? []).map((text) => agentPattern(text, "--deny"));
  return Object.freeze({
    ...policy,
    deny: [...policy.deny, ...deny],
    access: narrowing.readOnly === true ? "read" : policy.access,
  });
}

function oneOf<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  fallback: TValue,
  where: string,
): TValue {
  if (value === undefined) return fallback;
  const found = allowed.find((option) => option === value);
  if (found === undefined) {
    throw invalid(
      where,
      `takes ${allowed.map((option) => `"${option}"`).join(", ")}, not ${JSON.stringify(value)}`,
    );
  }
  return found;
}

function patterns(value: unknown, where: string): AgentPattern[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw invalid(where, 'takes a list of patterns: ["shop.orders.*"]');
  return value.map((text: unknown) => agentPattern(text, where));
}

function invalid(where: string, problem: string): ConfigurationError {
  return new ConfigurationError("AGENT_POLICY_INVALID", `[courier] ${where} ${problem}.`);
}
