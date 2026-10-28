import { assertCancelPrevious } from "../define/assert-cancel-previous";
import { HttpClient } from "../http-client/index";
import type { BaseOptions, Context } from "../http-client/types";
import type { CallTarget } from "./execute-target";
import { servesOneUser } from "./serves-one-user";

const pendingBySource = new WeakMap<object, Record<string, AbortController>>();

/**
 * Whether a newer call cancels this one while it is in flight: the nearest
 * say of the call's own `.with()`, its endpoint's `.cancelPrevious()`, its
 * groups', its caller's and its API's.
 *
 * @param target - The call, with the endpoint and the source it resolved to
 * @param context - The call's context, which carries its caller's default
 * @returns `true` when the nearest that says anything turns it on
 * @throws ConfigurationError `CANCEL_PREVIOUS_INVALID` when the call's own is neither `true` nor `false`
 * @example
 * ```ts
 * const instance = clientForCall(dataSource, context, kind, path, cancelPreviousOf(target, context));
 * ```
 */
export function cancelPreviousOf(target: CallTarget, context?: Context): boolean {
  const own = target.options?.cancelPrevious;
  assertCancelPrevious(own, "A call");
  const nearest =
    own ??
    target.endpointOptions?.cancelPrevious ??
    target.endpointGroup?.options.cancelPrevious ??
    context?.defaultCancelPrevious ??
    target.dataSource.options?.cancelPrevious;
  return nearest === true;
}

/**
 * The HTTP client one call runs on.
 *
 * It is built per call, because a call's context decides its headers and
 * path options, while its in-flight table lives as long as the source: a
 * fresh, empty table per call would let `cancelPrevious` cancel nothing.
 *
 * Of two calls to one endpoint whose `cancelPrevious` is on, the newer
 * cancels the older while it is still in flight — only in a browser or a
 * React Native app, and for a call that did not come off the wire. On a
 * server, requests from different users reach the same endpoint, and one
 * user's request would cancel another's. It only cancels a read: a write
 * that a newer one superseded has usually been applied by the server, and
 * cancelling it would tell its caller it had not.
 *
 * @param dataSource - The source the call belongs to
 * @param context - The call's context, when it has one
 * @param kind - Whether the endpoint reads or writes, from its schema
 * @param path - The endpoint's path in its API, such as `users.search`
 * @param cancelPrevious - Whether a newer call cancels this one, from `cancelPreviousOf`
 * @returns A client for this call
 */
export function clientForCall(
  dataSource: { options?: BaseOptions },
  context?: Context,
  kind?: "query" | "mutation",
  path?: string,
  cancelPrevious = false,
): HttpClient {
  const client = new HttpClient(dataSource.options, context);
  client.kind = kind;
  const cancels =
    cancelPrevious &&
    servesOneUser() &&
    context?.proxyMethod === undefined &&
    kind === "query" &&
    path !== undefined;
  if (cancels) {
    client.pendingRequests = pendingRequestsOf(dataSource);
    client.cancelKey = path;
  }
  return client;
}

function pendingRequestsOf(dataSource: object): Record<string, AbortController> {
  let pending = pendingBySource.get(dataSource);
  if (!pending) {
    pending = {};
    pendingBySource.set(dataSource, pending);
  }
  return pending;
}

/** An endpoint as a group or a source holds it: a descriptor carrying its wire closure. */
export interface EndpointEntry {
  readonly probe: (...args: never[]) => unknown;
}

/**
 * Recognise a value stored in a group or source as an endpoint.
 *
 * A descriptor keeps its wire closure under `probe`, so it is identified by
 * carrying one rather than by being callable itself.
 */
export const isEndpointEntry = (value: unknown): value is EndpointEntry =>
  typeof value === "object" &&
  value !== null &&
  "probe" in value &&
  typeof value.probe === "function";

export const getEndpoint = (target: object, name: string): EndpointEntry | undefined => {
  const endpoint: unknown = Reflect.get(target, name);
  return isEndpointEntry(endpoint) ? endpoint : undefined;
};
