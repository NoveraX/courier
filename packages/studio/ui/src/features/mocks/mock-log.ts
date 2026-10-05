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
