import type { RequestEntry } from "@/store/types-request";

/**
 * The calls an audit reads: the app's calls that have finished. A webhook
 * is left out — it is a call made to the app, by its sender.
 *
 * @param requests - The calls Studio holds
 * @returns Those the audit weighs
 * @example
 * ```ts
 * auditedCalls(requests).length; // what the report read
 * ```
 */
export function auditedCalls(requests: readonly RequestEntry[]): RequestEntry[] {
  return requests.filter((r) => r.status !== "pending" && r.mode !== "webhook");
}
