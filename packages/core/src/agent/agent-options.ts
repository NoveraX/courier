import { ConfigurationError } from "../errors/configuration-error";
import { isRecord } from "../utils/is-record";
import type { AgentAccess, AgentLimit, AgentOptions } from "./types";

const ACCESS: ReadonlySet<string> = new Set<AgentAccess>(["read", "write", "destructive"]);
/* Narrower than MCP's own rule: the model APIs a client passes tools to take these characters alone. */
const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Check what `.agent()` was given, where it was written, and keep a copy.
 *
 * The description is what the model decides by, so an empty one is refused,
 * as is an access other than the three a tool can declare. The copy is
 * frozen: a later change to the object passed in cannot widen what an
 * endpoint already offers.
 *
 * @param value - What `.agent()` was given
 * @param where - The endpoint's address for the message, such as `GET "orders/:id"`
 * @returns The options, checked and frozen
 * @throws ConfigurationError `AGENT_OPTIONS_INVALID` when they cannot describe a tool
 *
 * @example
 * ```ts
 * agentOptions({ description: "One order by its id", access: "read" }, 'GET "orders/:id"');
 * ```
 */
export function agentOptions(value: unknown, where: string): AgentOptions {
  if (!isRecord(value)) refuse(where, "takes an object: { description, access }");
  const { description, access, name, title, limit, ...unknown } = value;
  const extra = Object.keys(unknown);
  if (extra.length > 0) refuse(where, `has no option ${extra.map((key) => `"${key}"`).join(", ")}`);
  if (typeof description !== "string" || description.trim() === "") {
    refuse(where, "needs a description: what the tool does, for the model deciding to call it");
  }
  if (typeof access !== "string" || !ACCESS.has(access)) {
    refuse(where, 'needs an access: "read", "write" or "destructive"');
  }
  if (name !== undefined && (typeof name !== "string" || !TOOL_NAME.test(name))) {
    refuse(where, "takes a name of letters, digits, _ and - alone, at most 64 of them");
  }
  if (title !== undefined && (typeof title !== "string" || title.trim() === "")) {
    refuse(where, "takes a title that is a non-empty string");
  }
  return Object.freeze({
    description: description.trim(),
    access: access as AgentAccess,
    ...(name !== undefined && { name }),
    ...(title !== undefined && { title: title.trim() }),
    ...(limit !== undefined && { limit: limitOf(limit, where) }),
  });
}

/* A whole number of calls, at least one, in a window of at least a second. */
function limitOf(value: unknown, where: string): AgentLimit {
  if (!isRecord(value)) {
    refuse(
      where,
      "takes a limit of { maxCalls, window }: at most maxCalls calls in any window of milliseconds",
    );
  }
  const { maxCalls, window, ...unknown } = value;
  const extra = Object.keys(unknown);
  if (extra.length > 0)
    refuse(where, `has no limit option ${extra.map((key) => `"${key}"`).join(", ")}`);
  if (typeof maxCalls !== "number" || !Number.isInteger(maxCalls) || maxCalls < 1) {
    refuse(where, "takes a limit whose maxCalls is a whole number, at least 1");
  }
  if (typeof window !== "number" || !Number.isInteger(window) || window < 1000) {
    refuse(where, "takes a limit whose window is a whole number of milliseconds, at least 1000");
  }
  return Object.freeze({ maxCalls, window });
}

function refuse(where: string, problem: string): never {
  throw new ConfigurationError(
    "AGENT_OPTIONS_INVALID",
    `[courier] .agent() on ${where} ${problem}.`,
  );
}
