import type { RequestEntry } from "@/store/types";

/**
 * Whether a call sent a request of its own. A call another call's request
 * answered sent none: the network carried that request once, for all of
 * them, so every figure about the network counts it once.
 *
 * @param call - The call
 * @returns Whether it did
 * @example
 * ```ts
 * sentOwnRequest({ shared: { by: "flight", with: "req_1" } }); // false
 * ```
 */
export function sentOwnRequest(call: Pick<RequestEntry, "shared">): boolean {
  return call.shared === undefined;
}

/**
 * The calls that sent a request of their own: what every figure about the
 * network — its latency, its pace, its bytes, its failures — counts.
 *
 * @param calls - The calls
 * @returns Those that sent their own request
 * @example
 * ```ts
 * ownRequests(requests).length; // the requests the network carried
 * ```
 */
export function ownRequests<TCall extends Pick<RequestEntry, "shared">>(
  calls: readonly TCall[],
): TCall[] {
  return calls.filter(sentOwnRequest);
}

/**
 * How many requests went out, and — where some calls sent none of their
 * own — how many calls there were.
 *
 * @param calls - The calls
 * @param requests - The requests they sent
 * @returns `"5 requests"`, or `"14 calls · 5 requests"`
 * @example
 * ```ts
 * callsAndRequests(14, 5); // "14 calls · 5 requests"
 * ```
 */
export function callsAndRequests(calls: number, requests: number): string {
  const sent = `${requests} ${requests === 1 ? "request" : "requests"}`;
  return calls === requests ? sent : `${calls} ${calls === 1 ? "call" : "calls"} · ${sent}`;
}
