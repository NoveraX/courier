import type { BodyRefusal } from "./read-request-body";

/**
 * A refusal of the proxy the mock stands in for, as the mock answers one:
 * its message, and its status — 405 for a GET the proxy refuses, 400 for
 * any other call it would not run.
 *
 * @param refused - The proxy's status and message
 * @returns The refusal the mock answers with
 * @example
 * ```ts
 * refusalOf({ status: 405, message: "This endpoint does not support GET requests" }).status; // → 405
 * ```
 */
export function refusalOf({ status, message }: { status: number; message: string }): BodyRefusal {
  return { error: message, status: status === 405 ? 405 : 400 };
}
