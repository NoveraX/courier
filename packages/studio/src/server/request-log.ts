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
import type { RequestLog } from "./request-log-types";
import { requestLogWrites } from "./request-log-writes";
import { lazyRequestOutline } from "./request-outline";
import { requestRows, type StoredRequest } from "./storage/request-rows";

export type { RequestLog } from "./request-log-types";

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

/**
 * Open the request log kept in a database, ending the requests a previous
 * Studio left open. A page that connects is sent its newest requests, each
 * whole, as many as fit `replayBytes`. The oldest request goes to make room
 * for a new one, unless it is pinned.
 *
 * @param db - Studio's database
 * @param replayBytes - The most of the log a page is sent as it connects
 * @param isPinned - Whether a page pinned a request
 * @returns The log
 *
 * @example
 * ```ts
 * const log = createRequestLog(openStudioDb(projectRoot).db);
 * log.record(event, socket.id);
 * uiSocket.emit("events:replay", log.replayPayload());
 * ```
 */
export function createRequestLog(
  db: DatabaseSync,
  replayBytes?: number,
  isPinned: (id: string) => boolean = () => false,
): RequestLog {
  const rows = requestRows(db, replayBytes);
  const requests = new Map<string, LoggedRequest>();
  const writes = requestLogWrites(rows, (id) => rowOf(id, requests.get(id)));
  const outline = lazyRequestOutline(() => {
    writes.flush();
    return rows.keyEvents();
  });
  let next = 0;
  let changes = 0;

  function append(id: string, request: LoggedRequest, event: RuntimeEvent): void {
    writes.event(id, event);
    outline.see(id, event);
    changes += 1;
    request.events += 1;
  }

  function drop(id: string): void {
    requests.delete(id);
    outline.drop(id);
    changes += 1;
    writes.drop(id);
  }

  function start(id: string, event: RuntimeEvent, owner: string): void {
    const known = requests.get(id);
    if (known) {
      append(id, known, event);
      return;
    }
    /* The oldest request goes to make room, unless a page pinned it. */
    if (requests.size >= MAX_REQUESTS) {
      for (const kept of requests.keys()) {
        if (isPinned(kept)) continue;
        drop(kept);
        break;
      }
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
  writes.flush();

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
      writes.flush();
      return rows.events();
    },
    replayPayload() {
      writes.flush();
      return Buffer.from(rows.replayText(), "utf8");
    },
    keyEvents: outline.events,
    version: () => changes,
    eventsOf(id) {
      if (!requests.has(id)) return [];
      writes.flush();
      return rows.eventsOf(id);
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
      writes.flush();
    },
    close: writes.close,
  };
}

/* A request's row, as the database keeps it. */
function rowOf(id: string, request: LoggedRequest | undefined): StoredRequest | undefined {
  return request && { id, position: request.position, open: request.open, events: request.events };
}
