import { HTTPError } from "@noverax/courier";

import { createFaultError, pickFault } from "../network/failure";
import { isMockHttpError } from "../server/errors";
import type { MockHistoryEntry, NetworkConfig } from "../types";
import type { ResolvedHandler } from "./types";

/** One mock client call, as its history entry names it */
export interface HttpCall {
  group: string;
  method: string;
  variables: unknown;
  history: MockHistoryEntry[];
  start: number;
}

/**
 * Record a call's outcome in the client's history.
 *
 * @param call    The call
 * @param outcome What it answered or failed with, and whether a mock handled it
 * @returns Nothing; the entry is appended to `call.history`
 * @example
 * ```ts
 * recordOutcome(call, { mocked: true, result: { status: 200, data } });
 * ```
 */
export function recordOutcome(
  call: HttpCall,
  outcome: Pick<MockHistoryEntry, "mocked" | "error" | "result">,
): void {
  const { group, method, variables, history, start } = call;
  history.push({
    group,
    method,
    variables,
    ...outcome,
    duration: Date.now() - start,
    timestamp: start,
  });
}

/**
 * The error an injected network fault fails the call with.
 *
 * @param call    The call
 * @param network The network config that chose to fail it
 * @returns The `HTTPError`, recorded in the history
 * @example
 * ```ts
 * throw networkFault(call, { errorRate: 1 });
 * ```
 */
export function networkFault(call: HttpCall, network: NetworkConfig): HTTPError {
  const { status, message } = createFaultError(pickFault(network));
  const error = new HTTPError({ status, headers: new Headers(), data: { message } });
  recordOutcome(call, { mocked: true, error });
  return error;
}

/**
 * The error a call with no mock fails with.
 *
 * @param call          The call
 * @param scenarioState The state no handler matched
 * @returns The error, recorded in the history
 * @example
 * ```ts
 * throw missingHandler(call, "Started");
 * ```
 */
export function missingHandler(call: HttpCall, scenarioState: string): Error {
  const { group, method } = call;
  const error = new Error(
    `[courier-mock] No mock for "${group}.${method}" in state "${scenarioState}". ` +
      `Call mock("${group}", "${method}").resolves(data) first.`,
  );
  recordOutcome(call, { mocked: false, error });
  return error;
}

/**
 * The `HTTPError` an error answer (`rejects`, an error sequence entry)
 * fails the call with.
 *
 * @param call    The call
 * @param handler The handler, with the status it answered with
 * @param data    The error body
 * @returns The error, recorded in the history
 * @example
 * ```ts
 * throw handlerError(call, handler, { message: "down" });
 * ```
 */
export function handlerError(call: HttpCall, handler: ResolvedHandler, data: unknown): HTTPError {
  const error = new HTTPError({
    status: handler.status,
    headers: new Headers(handler.headers),
    data,
  });
  recordOutcome(call, {
    mocked: true,
    error,
    result: { status: handler.status, data, headers: handler.headers },
  });
  return error;
}

/**
 * The error a call fails with when its handler threw: an `HTTPError` as it
 * is — a replayed recording rejects with one — and a `MockHttpError` as an
 * `HTTPError` with its status and `{ error }`, the answer the mock server
 * gives for it. Anything else is passed on untouched.
 *
 * @param call   The call
 * @param thrown What the handler threw
 * @returns The error to reject with, recorded in the history when it is an Error
 * @example
 * ```ts
 * throw thrownByHandler(call, new MockHttpError(404, "not found"));
 * ```
 */
export function thrownByHandler(call: HttpCall, thrown: unknown): unknown {
  const error = isMockHttpError(thrown)
    ? new HTTPError({
        status: thrown.status,
        headers: new Headers(),
        data: { error: thrown.message },
      })
    : thrown;
  if (error instanceof Error) recordOutcome(call, { mocked: true, error });
  return error;
}
