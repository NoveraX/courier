import { ConfigurationError } from "@noverax/courier";

/** A pattern of the `agents` policy, checked, and the endpoints it names. */
export interface AgentPattern {
  /** As the policy writes it: `shop.orders.*`. */
  readonly text: string;
  /** Where it was written, for a message: `agents.deny`, `--deny`. */
  readonly where: string;
  /** Whether it names an endpoint, by its call under its source: `shop.orders.cancel`. */
  matches(path: string): boolean;
}

const ANY_NAMES = "**";
/* One name of a call: anything but the dot that ends it, and the space no name holds. */
const NAME = /^[^.\s]+$/;

/**
 * A pattern from the `agents` policy, which names endpoints by their call
 * under their source: `shop.orders.cancel`. `*` stands for any part of one
 * name — `shop.orders.*`, `shop.*.list`, `shop.orders.get*` — and `**`, a
 * name of its own, for any number of names, none among them: `billing.**`.
 *
 * @param text - The pattern as written
 * @param where - Its place in the policy, for the message: `agents.deny`
 * @returns The pattern, checked
 * @throws ConfigurationError `AGENT_POLICY_INVALID` for a pattern that names nothing
 * @example
 * ```ts
 * agentPattern("billing.**", "agents.deny").matches("billing.invoices.void"); // true
 * ```
 */
export function agentPattern(text: unknown, where: string): AgentPattern {
  if (typeof text !== "string" || text === "") {
    throw invalid(where, `takes patterns such as "shop.orders.*", not ${JSON.stringify(text)}`);
  }
  const names = text.split(".");
  for (const name of names) {
    if (!NAME.test(name)) {
      throw invalid(where, `has "${text}", whose names are empty or hold a space`);
    }
    if (name.includes(ANY_NAMES) && name !== ANY_NAMES) {
      throw invalid(where, `has "${text}": ** stands for whole names, between dots`);
    }
  }
  const parts = names.map((name) => (name === ANY_NAMES ? ANY_NAMES : nameTest(name)));
  return { text, where, matches: (path) => matchFrom(parts, 0, path.split("."), 0) };
}

/* One name with its `*`s, as a test of a whole name. */
function nameTest(name: string): RegExp {
  const source = name
    .split("*")
    .map((piece) => piece.replace(/[\\^$+?.()|[\]{}]/g, "\\$&"))
    .join("[^.]*");
  return new RegExp(`^${source}$`);
}

/* Whether the pattern from `at` names the path from `from`: `**` tries every number of names. */
function matchFrom(
  parts: readonly (RegExp | typeof ANY_NAMES)[],
  at: number,
  path: readonly string[],
  from: number,
): boolean {
  if (at === parts.length) return from === path.length;
  const part = parts[at];
  if (part === ANY_NAMES) {
    for (let next = from; next <= path.length; next += 1) {
      if (matchFrom(parts, at + 1, path, next)) return true;
    }
    return false;
  }
  const name = path[from];
  return name !== undefined && part !== undefined && part.test(name)
    ? matchFrom(parts, at + 1, path, from + 1)
    : false;
}

function invalid(where: string, problem: string): ConfigurationError {
  return new ConfigurationError("AGENT_POLICY_INVALID", `[courier] ${where} ${problem}.`);
}
