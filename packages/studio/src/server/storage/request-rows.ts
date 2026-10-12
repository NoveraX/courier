/**
 * The requests Studio has seen, as its database keeps them: each request's
 * place in the log and whether it is still open, and its events in order.
 */

import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { REPLAY_BYTES } from "./replay-bytes";
import { withoutCredentials } from "./without-credentials";

type RuntimeEvent = Record<string, unknown>;

/** A request's row */
export interface StoredRequest {
  id: string;
  /** Its place in the log: a later request has a greater one */
  position: number;
  open: boolean;
  /** How many of its events are kept */
  events: number;
}

/** What one write changes, in one transaction */
export interface RequestBatch {
  events: Array<{ id: string; event: RuntimeEvent }>;
  requests: StoredRequest[];
  dropped: string[];
}

/** The rows of the log */
export interface RequestRows {
  /** Every request, oldest first */
  requests(): StoredRequest[];
  /** A request's first event */
  openingOf(id: string): RuntimeEvent | undefined;
  /** The kept events a page is sent as it connects: the newest requests', each whole and in the order its events arrived, as many as fit the replay, oldest request first */
  events(): RuntimeEvent[];
  /** What `events` returns, as the JSON array text the database's rows make, none of them parsed */
  replayText(): string;
  /** The events that open and end each request, without the bodies and headers they carry, in the order they came */
  keyEvents(): Array<{ id: string; event: RuntimeEvent }>;
  /** One request's events, whole, in the order they came */
  eventsOf(id: string): RuntimeEvent[];
  write(batch: RequestBatch): void;
}

/**
 * The log's rows in a database.
 *
 * @param db - Studio's database
 * @returns Its rows
 * @example
 * ```ts
 * requestRows(db).write({ events: [{ id: "r1", event }], requests: [row], dropped: [] });
 * ```
 */
export function requestRows(db: DatabaseSync, replayBytes: number = REPLAY_BYTES): RequestRows {
  const listRequests = db.prepare(
    "SELECT id, position, open, events FROM requests ORDER BY position",
  );
  const firstEvent = db.prepare(
    "SELECT body FROM request_events WHERE request_id = ? ORDER BY seq LIMIT 1",
  );
  /* The newest requests whose events fit the replay, each whole, oldest first. */
  const listEvents = db.prepare(
    "WITH sized AS (SELECT r.id, r.position, " +
      "(SELECT COALESCE(SUM(LENGTH(body)), 0) FROM request_events WHERE request_id = r.id) AS bytes " +
      "FROM requests r), " +
      "kept AS (SELECT id, position, " +
      "SUM(bytes) OVER (ORDER BY position DESC ROWS UNBOUNDED PRECEDING) AS upto FROM sized) " +
      "SELECT e.body FROM request_events e JOIN kept k ON k.id = e.request_id " +
      "WHERE k.upto <= ? ORDER BY k.position, e.seq",
  );
  /* The database reads each event's type and leaves out its bodies, so a list never parses an answer. */
  const listKeyEvents = db.prepare(
    "SELECT request_id, json_remove(body, '$.data', '$.variables', '$.headers', '$.requestHeaders') AS body " +
      "FROM request_events WHERE json_extract(body, '$.type') IN " +
      "('request:start', 'request:end', 'request:error', 'stream:open', 'stream:close', 'stream:error') " +
      "ORDER BY seq",
  );
  const eventsOfRequest = db.prepare(
    "SELECT body FROM request_events WHERE request_id = ? ORDER BY seq",
  );
  const insertEvent = db.prepare("INSERT INTO request_events (request_id, body) VALUES (?, ?)");
  const upsertRequest = db.prepare(
    "INSERT INTO requests (id, position, open, events) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (id) DO UPDATE SET open = excluded.open, events = excluded.events",
  );
  const deleteEvents = db.prepare("DELETE FROM request_events WHERE request_id = ?");
  const deleteRequest = db.prepare("DELETE FROM requests WHERE id = ?");

  return {
    requests: () =>
      listRequests.all().map((row) => ({
        id: String(row.id),
        position: Number(row.position),
        open: Number(row.open) === 1,
        events: Number(row.events),
      })),
    openingOf: (id) => eventOf(firstEvent.get(id)?.body),
    events: () =>
      listEvents.all(replayBytes).flatMap((row): RuntimeEvent[] => {
        const event = eventOf(row.body);
        return event ? [event] : [];
      }),
    replayText: () =>
      `[${listEvents
        .all(replayBytes)
        .map((row) => String(row.body))
        .join(",")}]`,
    keyEvents: () =>
      listKeyEvents.all().flatMap((row) => {
        const event = eventOf(row.body);
        return event ? [{ id: String(row.request_id), event }] : [];
      }),
    eventsOf: (id) =>
      eventsOfRequest.all(id).flatMap((row): RuntimeEvent[] => {
        const event = eventOf(row.body);
        return event ? [event] : [];
      }),
    write(batch) {
      db.exec("BEGIN");
      try {
        for (const id of batch.dropped) {
          deleteEvents.run(id);
          deleteRequest.run(id);
        }
        for (const { id, event } of batch.events) {
          insertEvent.run(id, JSON.stringify(withoutCredentials(event)));
        }
        for (const row of batch.requests)
          upsertRequest.run(row.id, row.position, row.open ? 1 : 0, row.events);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function eventOf(body: SQLOutputValue | undefined): RuntimeEvent | undefined {
  if (typeof body !== "string") return undefined;
  const value: unknown = JSON.parse(body);
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...value }
    : undefined;
}
