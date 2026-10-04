import { HttpClient } from "../http-client/index";
import type { BaseOptions, Context } from "../http-client/types";

const pendingBySource = new WeakMap<object, Record<string, AbortController>>();

/**
 * The HTTP client one call runs on.
 *
 * It is built per call, because a call's context decides its headers and
 * path options — but a fresh client meant a fresh, empty in-flight table,
 * so `deduplicate` never cancelled anything. The table now lives as long as
 * the source.
 *
 * Deduplication only runs in a browser, for a call that did not come off the
 * wire. On a server, requests from different users reach the same endpoint
 * under the same key, and one user's request would cancel another's. It only
 * runs for a read: a write that a newer one superseded has usually been
 * applied by the server, and cancelling it told its caller it had not.
 *
 * @param dataSource - The source the call belongs to
 * @param context - The call's context, when it has one
 * @param kind - Whether the endpoint reads or writes, from its schema
 * @returns A client for this call
 */
export function clientForCall(
  dataSource: { options?: BaseOptions },
  context?: Context,
  kind?: "query" | "mutation",
): HttpClient {
  const inBrowser = Reflect.get(globalThis, "document") !== undefined;
  const dedupes = inBrowser && context?.proxyMethod === undefined && kind === "query";
  const options = dedupes ? dataSource.options : { ...dataSource.options, deduplicate: false };
  const client = new HttpClient(options, context);
  if (dedupes) client.pendingRequests = pendingRequestsOf(dataSource);
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
