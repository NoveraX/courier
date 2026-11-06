import { studioHooksHere } from "../capabilities/studio-hooks";
import { AbortError } from "../errors/abort-error";

export const supportsAbortController = typeof globalThis.AbortController === "function";

/** A call that holds an endpoint, and whether a request of it is in flight. */
interface Holder {
  readonly controller: AbortController;
  inFlight: boolean;
  /** What the call was cancelled with, once a newer call superseded it. */
  cancelled?: AbortError;
}

/** The calls holding each endpoint, the newest last: one API's, or one set of routes'. */
export type EndpointHolds = Map<string, Holder[]>;

/**
 * A call's hold on its endpoint, from the moment it starts until it
 * settles: across its attempts, and the waits between them.
 */
export interface EndpointHold {
  /** Aborted, with an `AbortError` of code `SUPERSEDED`, once a newer call supersedes the call. */
  readonly signal: AbortSignal;
  /**
   * Before each request the call sends.
   *
   * @throws The `AbortError` the call is cancelled with, when a newer call has superseded it meanwhile
   */
  sending(): void;
  /** Once a request has been handed to `fetch`: the older calls still in flight are cancelled now. */
  sent(): void;
  /** When a request comes back, answered or not. */
  returned(): void;
  /** When the call settles: it lets go of the endpoint. */
  release(): void;
}

/**
 * Hold an endpoint for a call that a newer one cancels, and cancel the older
 * calls it supersedes.
 *
 * An older call with no request in flight — still getting ready to send,
 * or waiting between attempts — has nothing a newer call could join, so it
 * is cancelled at once and never sends. One with a request in flight is
 * cancelled once the newer call's own request has started, so a newer call
 * identical to it joins its request rather than send another. A call that
 * settles without sending cancels those too: their answers are stale all
 * the same.
 *
 * @param holds - Where the calls holding each endpoint are kept
 * @param key - The endpoint, as the call names it
 * @returns The call's hold
 * @example
 * ```ts
 * const hold = holdEndpoint(holds, "api:users.search");
 * try {
 *   hold.sending();
 *   const sending = fetch(url, { signal: hold.signal });
 *   hold.sent();
 *   return await sending;
 * } finally {
 *   hold.returned();
 *   hold.release();
 * }
 * ```
 */
export function holdEndpoint(holds: EndpointHolds, key: string): EndpointHold {
  const mine: Holder = { controller: new AbortController(), inFlight: false };
  const kept: Holder[] = [];
  for (const older of holds.get(key) ?? []) {
    if (older.inFlight) kept.push(older);
    else cancel(older, key);
  }
  holds.set(key, [...kept, mine]);

  /* Cancel each call older than this one, and keep the rest. */
  const cancelOlder = (): number => {
    const lane = holds.get(key) ?? [];
    const at = lane.indexOf(mine);
    for (const older of lane.slice(0, Math.max(at, 0))) cancel(older, key);
    return at;
  };

  return {
    signal: mine.controller.signal,
    sending() {
      if (holds.get(key)?.at(-1) !== mine) throw cancel(mine, key);
      mine.inFlight = true;
    },
    sent() {
      const at = cancelOlder();
      if (at > 0) holds.set(key, (holds.get(key) ?? []).slice(at));
    },
    returned() {
      mine.inFlight = false;
    },
    release() {
      const at = cancelOlder();
      if (at < 0) return;
      const newer = (holds.get(key) ?? []).slice(at + 1);
      if (newer.length > 0) holds.set(key, newer);
      else holds.delete(key);
    },
  };
}

/* Cancel a call a newer one superseded, and tell Studio — once. */
function cancel(holder: Holder, key: string): AbortError {
  if (holder.cancelled) return holder.cancelled;
  const cancelled = new AbortError({ code: "SUPERSEDED" });
  holder.cancelled = cancelled;
  const studio = studioHooksHere();
  studio.onCallSuperseded?.({ key, timestamp: Date.now() });
  studio.onRequestAbort?.({ id: key, reason: "superseded", timestamp: Date.now() });
  holder.controller.abort(cancelled);
  return cancelled;
}
