import type { MockRequestLog } from "@/store/mock-slice";

/**
 * The tone a mock's answer reads in: a failure or a server error red, a
 * client error amber, any other answer green.
 *
 * @param log - The logged request
 * @returns Its tone
 * @example
 * ```ts
 * mockLogTone({ ...log, status: 404 }); // "warn"
 * ```
 */
export function mockLogTone(log: Pick<MockRequestLog, "status" | "error">): "ok" | "warn" | "err" {
  if (log.error !== undefined || (log.status ?? 0) >= 500) return "err";
  return (log.status ?? 0) >= 400 ? "warn" : "ok";
}

/**
 * What a mock's answer says in place of a status code when it has none.
 *
 * @param log - The logged request
 * @returns Its code, `ERR` for a failure without one, `···` while it runs
 * @example
 * ```ts
 * mockLogCode({ status: undefined, error: "reset" }); // "ERR"
 * ```
 */
export function mockLogCode(log: Pick<MockRequestLog, "status" | "error">): string {
  if (log.status !== undefined) return String(log.status);
  return log.error !== undefined ? "ERR" : "···";
}

/**
 * The requests a mock server answered, newest first.
 *
 * @param logs - Every mock's logged requests, newest first
 * @param serverId - The server
 * @returns Its requests
 * @example
 * ```ts
 * logsOf(logs, "api-mock").length; // 136
 * ```
 */
export function logsOf(logs: readonly MockRequestLog[], serverId: string): MockRequestLog[] {
  return logs.filter((log) => log.serverId === serverId);
}

/** A failure the mock's chaos injected on purpose, by kind: an error status, `timeout`, `reset` or `interrupt`. */
export type InjectedFault = string;

/* How the mock words the failures its chaos injects (createFaultError in @noverax/courier-mock):
   `HTTP 413 Content Too Large (simulated)`, and a status the registry names no reason for as `HTTP 499 (simulated)`. */
const SIMULATED =
  /^(?:HTTP ([45]\d\d)(?: [A-Za-z' -]+)?|(Request Timeout)|(Connection Reset)|(Upload Interrupted)) \(simulated\)$/;

/**
 * The kind of failure the mock's chaos injected into an answer, told apart
 * from a handler's own error by the mock's wording for its simulated
 * faults.
 *
 * @param log - The logged request
 * @returns The fault's kind, or `undefined` for an answer chaos left alone
 * @example
 * ```ts
 * injectedFault({ error: "Connection Reset (simulated)" }); // "reset"
 * injectedFault({ error: "HTTP 413 Content Too Large (simulated)" }); // "413"
 * injectedFault({ error: "HTTP 500" }); // undefined
 * ```
 */
export function injectedFault(log: Pick<MockRequestLog, "error">): InjectedFault | undefined {
  const match = log.error === undefined ? null : SIMULATED.exec(log.error);
  if (!match) return undefined;
  if (match[2]) return "timeout";
  if (match[3]) return "reset";
  if (match[4]) return "interrupt";
  return match[1];
}
