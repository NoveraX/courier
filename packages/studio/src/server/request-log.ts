/**
 * The runtime events of the latest requests Studio has seen, kept in
 * Studio's database.
 *
 * Kept so that a Studio page that connects — for the first time, after a
 * reload, or after Studio itself restarted — is shown the requests captured
 * before it, and so that the requests a runtime leaves open when it goes
 * away can be ended: the runtime can no longer say how they ended, and its
 * events sent while its socket was down are dropped at the source. The
 * requests a previous Studio left open are ended when this one starts.
 */

import type { DatabaseSync } from "node:sqlite";

import { closingEvent, isClosing, isOpening, requestIdOf } from "./request-log-events";
import { type RequestBatch, requestRows } from "./storage/request-rows";

type RuntimeEvent = Record<string, unknown>;

/** As many requests as the UI keeps by default. */
export const MAX_REQUESTS: number = 2000;

/**
 * The events kept per request. A stream's later messages beyond it are
 * dropped: a replayed stream that is still open shows fewer messages than
 * it carried, and one that closed shows its totals from its closing event.
 */
const MAX_EVENTS_PER_REQUEST = 250;

interface LoggedRequest {
  position: number;
  open: boolean;
  events: number;
  /** The runtime socket its events arrive on; none for a request a previous Studio saw. */
  owner?: string;
  opening?: RuntimeEvent;
}

export interface RequestLog {
  /** Keep an event a runtime sent, once it has been passed to the UI. */
  record: (event: RuntimeEvent, owner: string) => void;
  /** The kept events a page is sent as it connects: the newest requests', each whole and in the order its events arrived, as many as fit the replay, oldest request first. */
  events: () => RuntimeEvent[];
  /** End the requests a runtime socket left open; returns the events that end them, already kept. */
  endOpen: (owner: string) => RuntimeEvent[];
  /** Forget every request but the ones named. */
  forget: (keep: ReadonlySet<string>) => void;
  /** Write what is kept to the database, and keep nothing more: the database is closing. */
  close: () => void;
}

/**
 * Open the request log kept in a database, ending the requests a previous
 * Studio left open. A page that connects is sent its newest requests, each
 * whole, as many as fit `replayBytes`.
 *
 * @param db - Studio's database
 * @param replayBytes - The most of the log a page is sent as it connects
 * @returns The log
 *
 * @example
 * ```ts
 * const log = createRequestLog(openStudioDb(projectRoot).db);
 * log.record(event, socket.id);
 * uiSocket.emit("events:replay", log.events());
 * ```
 */
export function createRequestLog(db: DatabaseSync, replayBytes?: number): RequestLog {
  const rows = requestRows(db, replayBytes);
  const requests = new Map<string, LoggedRequest>();
  let batch: RequestBatch = { events: [], requests: [], dropped: [] };
  const changed = new Set<string>();
  let next = 0;
  let scheduled = false;
  let closed = false;

  function flush(): void {
    scheduled = false;
    if (closed) return;
    for (const id of changed) {
      const request = requests.get(id);
      if (request)
        batch.requests.push({
          id,
          position: request.position,
          open: request.open,
          events: request.events,
        });
    }
    changed.clear();
    if (batch.events.length + batch.requests.length + batch.dropped.length === 0) return;
    const written = batch;
    batch = { events: [], requests: [], dropped: [] };
    rows.write(written);
  }

  function append(id: string, request: LoggedRequest, event: RuntimeEvent): void {
    batch.events.push({ id, event });
    request.events += 1;
    changed.add(id);
    if (scheduled) return;
    scheduled = true;
    setImmediate(flush);
  }

  function drop(id: string): void {
    requests.delete(id);
    changed.delete(id);
    batch.events = batch.events.filter((entry) => entry.id !== id);
    batch.dropped.push(id);
  }

  function start(id: string, event: RuntimeEvent, owner: string): void {
    const known = requests.get(id);
    if (known) {
      append(id, known, event);
      return;
    }
    if (requests.size >= MAX_REQUESTS) {
      const oldest = requests.keys().next().value;
      if (oldest !== undefined) drop(oldest);
    }
    const request: LoggedRequest = {
      position: next++,
      open: true,
      events: 0,
      owner,
      opening: event,
    };
    requests.set(id, request);
    append(id, request, event);
  }

  function end(id: string, request: LoggedRequest): RuntimeEvent {
    const event = closingEvent(id, request.opening ?? rows.openingOf(id) ?? {});
    request.open = false;
    append(id, request, event);
    return event;
  }

  for (const stored of rows.requests()) {
    requests.set(stored.id, {
      position: stored.position,
      open: stored.open,
      events: stored.events,
    });
    next = stored.position + 1;
  }
  for (const [id, request] of requests) if (request.open) end(id, request);
  flush();

  return {
    record(event, owner) {
      const id = requestIdOf(event);
      if (id === undefined) return;
      if (isOpening(event)) {
        start(id, event, owner);
        return;
      }
      const request = requests.get(id);
      if (!request) return;
      /* The event that ends a request is kept past the cap, so a replay
         never shows as open a request that ended. */
      const closing = isClosing(event);
      if (!closing && request.events >= MAX_EVENTS_PER_REQUEST) return;
      if (closing) request.open = false;
      append(id, request, event);
    },
    events() {
      flush();
      return rows.events();
    },
    endOpen(owner) {
      const ended: RuntimeEvent[] = [];
      for (const [id, request] of requests) {
        if (request.open && request.owner === owner) ended.push(end(id, request));
      }
      return ended;
    },
    forget(keep) {
      for (const id of [...requests.keys()]) if (!keep.has(id)) drop(id);
      flush();
    },
    close() {
      flush();
      closed = true;
    },
  };
}
