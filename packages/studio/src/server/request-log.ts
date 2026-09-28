/**
 * The runtime events of the latest requests Studio has seen.
 *
 * Kept so that a Studio page that connects — for the first time or after a
 * reload — is shown the requests captured before it, and so that the
 * requests a runtime leaves open when it goes away can be ended: the
 * runtime can no longer say how they ended, and its events sent while its
 * socket was down are dropped at the source.
 */

import { closingEvent, isClosing, isOpening, requestIdOf } from "./request-log-events";

type RuntimeEvent = Record<string, unknown>;

/** As many requests as the UI keeps by default. */
const MAX_REQUESTS = 2000;
/**
 * The events kept per request. A stream's later messages beyond it are
 * dropped: a replayed stream that is still open shows fewer messages than
 * it carried, and one that closed shows its totals from its closing event.
 */
const MAX_EVENTS_PER_REQUEST = 250;

interface LoggedRequest {
  /** The runtime socket the request's events arrive on. */
  owner: string;
  events: RuntimeEvent[];
  open: boolean;
}

export interface RequestLog {
  /** Keep an event a runtime sent, once it has been passed to the UI. */
  record: (event: RuntimeEvent, owner: string) => void;
  /** Every kept event, a request's events in the order they arrived, oldest request first. */
  events: () => RuntimeEvent[];
  /** End the requests a runtime socket left open; returns the events that end them, already kept. */
  endOpen: (owner: string) => RuntimeEvent[];
  /** Forget every request but the ones named. */
  forget: (keep: ReadonlySet<string>) => void;
}

/**
 * Start an empty request log.
 *
 * @returns The log
 *
 * @example
 * ```ts
 * const log = createRequestLog();
 * log.record(event, socket.id);
 * uiSocket.emit("events:replay", log.events());
 * ```
 */
export function createRequestLog(): RequestLog {
  const requests = new Map<string, LoggedRequest>();

  function start(id: string, event: RuntimeEvent, owner: string): void {
    if (requests.size >= MAX_REQUESTS && !requests.has(id)) {
      const oldest = requests.keys().next().value;
      if (oldest !== undefined) requests.delete(oldest);
    }
    const known = requests.get(id);
    if (known) known.events.push(event);
    else requests.set(id, { owner, events: [event], open: true });
  }

  return {
    record(event, owner) {
      const id = requestIdOf(event);
      if (id === undefined) return;
      if (isOpening(event)) return start(id, event, owner);
      const request = requests.get(id);
      if (!request) return;
      /* The event that ends a request is kept past the cap, so a replay
         never shows as open a request that ended. */
      const closing = isClosing(event);
      if (!closing && request.events.length >= MAX_EVENTS_PER_REQUEST) return;
      request.events.push(event);
      if (closing) request.open = false;
    },
    events: () => [...requests.values()].flatMap((request) => request.events),
    endOpen(owner) {
      const ended: RuntimeEvent[] = [];
      for (const [id, request] of requests) {
        if (!request.open || request.owner !== owner) continue;
        const event = closingEvent(id, request.events[0] ?? {});
        request.events.push(event);
        request.open = false;
        ended.push(event);
      }
      return ended;
    },
    forget(keep) {
      for (const id of requests.keys()) if (!keep.has(id)) requests.delete(id);
    },
  };
}
