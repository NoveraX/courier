import { assertCancelPrevious } from "../define/assert-cancel-previous";
import { HttpClient } from "../http-client/index";
import type { BaseOptions, Context } from "../http-client/types";
import {
  type EndpointHold,
  type EndpointHolds,
  holdEndpoint,
  supportsAbortController,
} from "./cancel-previous";
import type { CallTarget } from "./execute-target";
import { servesOneUser } from "./serves-one-user";

/* The calls holding each endpoint of a source, which every client of it shares. */
const holdsBySource = new WeakMap<object, EndpointHolds>();

/**
 * The hold a call takes on its endpoint when a newer call is to cancel it:
 * a read whose `cancelPrevious` is on — the nearest say of the call's own
 * `.with()`, its endpoint's `.cancelPrevious()`, its groups', its caller's
 * and its API's — made in a browser or a React Native app, and not one that
 * came off the wire. On a server, requests from different users reach the
 * same endpoint, and one user's request would cancel another's. A write is
 * never held: a write that a newer one superseded has usually been applied
 * by the server, and cancelling it would tell its caller it had not.
 *
 * Every client of one source shares its holds, so a newer call through one
 * cancels an older call through another.
 *
 * @param target - The call, with the endpoint and the source it resolved to
 * @param context - The call's context, which carries its caller's default
 * @returns The call's hold, or `undefined` when no newer call is to cancel it
 * @throws ConfigurationError `CANCEL_PREVIOUS_INVALID` when the call's own is neither `true` nor `false`
 * @example
 * ```ts
 * const hold = holdOf(target, context);
 * ```
 */
export function holdOf(target: CallTarget, context?: Context): EndpointHold | undefined {
  const own = target.options?.cancelPrevious;
  assertCancelPrevious(own, "A call");
  const nearest =
    own ??
    target.endpointOptions?.cancelPrevious ??
    target.endpointGroup?.options.cancelPrevious ??
    context?.defaultCancelPrevious ??
    target.dataSource.options?.cancelPrevious;
  const held =
    nearest === true &&
    supportsAbortController &&
    servesOneUser() &&
    context?.proxyMethod === undefined &&
    target.schema?.type === "query";
  if (!held) return undefined;
  const path = [target.group, target.method].filter((part) => part !== undefined && part !== "");
  return holdEndpoint(holdsOf(target.dataSource), path.join("."));
}

function holdsOf(dataSource: object): EndpointHolds {
  let holds = holdsBySource.get(dataSource);
  if (!holds) {
    holds = new Map();
    holdsBySource.set(dataSource, holds);
  }
  return holds;
}

/**
 * The HTTP client one call runs on.
 *
 * It is built per call, because a call's context decides its headers and
 * path options, and the hold it carries is the call's own.
 *
 * @param dataSource - The source the call belongs to
 * @param context - The call's context, when it has one
 * @param kind - Whether the endpoint reads or writes, from its schema
 * @param hold - The call's hold on its endpoint, from `holdOf`
 * @returns A client for this call
 */
export function clientForCall(
  dataSource: { options?: BaseOptions },
  context?: Context,
  kind?: "query" | "mutation",
  hold?: EndpointHold,
): HttpClient {
  const client = new HttpClient(dataSource.options, context);
  client.kind = kind;
  client.hold = hold;
  return client;
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
