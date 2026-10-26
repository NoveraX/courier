import { errorCode } from "./error-code";
import { networkMembers } from "./network-reason";
import { shownReason } from "./shown-reason";

/** How many of the addresses a host name resolved to are told, each with why it refused. */
const MOST_ADDRESSES = 4;

/**
 * A failure as the line an agent is shown: its code, unless its text names
 * it, and its text, cleaned and cut short by {@link shownReason} — or its
 * name, when it says nothing at all.
 *
 * OpenSSL's text leads with its error queue's codes and its source file, so
 * its reason is told instead — `wrong version number`. A failure gathered
 * from each address a host name resolved to, which says nothing itself, is
 * told by why each address refused.
 *
 * @param error - The failure
 * @param limit - How long its text may be
 * @returns The line
 * @example
 * ```ts
 * reasonLine(new TypeError("fetch failed", { cause }).cause, 300);
 * // "UND_ERR_CONNECT_TIMEOUT: Connect Timeout Error (attempted address: api.example.com:443, timeout: 10000ms)"
 * ```
 */
export function reasonLine(error: Error, limit: number): string {
  return shownReason(textOf(error, limit), { code: errorCode(error), limit }) || error.name;
}

function textOf(error: Error, limit: number): string {
  const reason: unknown = Reflect.get(error, "reason");
  if (typeof reason === "string" && typeof Reflect.get(error, "library") === "string") {
    return reason;
  }
  /* A thrown error's message is whatever was put there: a number, nothing at all. */
  const said: unknown = Reflect.get(error, "message");
  const message = typeof said === "string" ? said : String(said ?? "");
  if (message !== "" || !(error instanceof AggregateError)) return message;
  const addresses = networkMembers(error);
  const told = addresses.slice(0, MOST_ADDRESSES).map((address) => reasonLine(address, limit));
  const untold = addresses.length - told.length;
  return untold > 0 ? `${told.join("; ")}; and ${untold} more` : told.join("; ");
}
