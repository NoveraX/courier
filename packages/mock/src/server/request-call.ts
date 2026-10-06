import { randomUUID } from "node:crypto";

import { pickFault, shouldFail } from "../network/failure";
import type { NetworkConfig } from "../types";

/** A request as the mock follows it from arrival to answer. */
export interface MockCall {
  /** The id its events and history carry. */
  id: string;
  /** When the mock took it in hand, as `performance.now()`: its duration counts its upload. */
  start: number;
  /** The fault decided for it, once decided — `null` for none. */
  fault?: string | null | undefined;
}

/* Keyed by the request itself: one entry per request, gone with it. */
const CALLS = new WeakMap<Request, MockCall>();

/**
 * The call a request is: made the first time the mock takes the request in
 * hand — as its body starts to arrive, or as it is answered — and the same
 * every time after, so the progress of its upload, a refusal and its answer
 * all carry one id, and its duration runs from its arrival.
 *
 * @param request - The request
 * @returns Its call
 * @example
 * ```ts
 * const { id, start } = callOf(c.req.raw);
 * ```
 */
export function callOf(request: Request): MockCall {
  const known = CALLS.get(request);
  if (known) return known;
  const call: MockCall = { id: `req_${randomUUID()}`, start: performance.now() };
  CALLS.set(request, call);
  return call;
}

/**
 * The fault a request fails with, decided once: the first time it is asked
 * — before its body is read, so an `interrupt` can cut the body off, or as
 * it is answered — and the same after.
 *
 * @param request - The request
 * @param network - The network conditions its route is answered under
 * @returns The fault, or `undefined` when it does not fail
 * @example
 * ```ts
 * const fault = faultOf(c.req.raw, resolveNetConfig(config, group, method));
 * ```
 */
export function faultOf(request: Request, network: NetworkConfig | undefined): string | undefined {
  const call = callOf(request);
  if (call.fault === undefined) {
    call.fault = network && shouldFail(network) ? pickFault(network) : null;
  }
  return call.fault ?? undefined;
}
