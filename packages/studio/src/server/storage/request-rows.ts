/**
 * The requests Studio has seen, as its database keeps them: each request's
 * place in the log and whether it is still open, and its events in order.
 */

import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
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
  /** Every kept event: a request's in the order they arrived, oldest request first */
  events(): RuntimeEvent[];
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
export function requestRows(db: DatabaseSync): RequestRows {
  const listRequests = db.prepare(
    "SELECT id, position, open, events FROM requests ORDER BY position",
  );
  const firstEvent = db.prepare(
    "SELECT body FROM request_events WHERE request_id = ? ORDER BY seq LIMIT 1",
  );
  const listEvents = db.prepare(
    "SELECT e.body FROM request_events e JOIN requests r ON r.id = e.request_id ORDER BY r.position, e.seq",
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
      listEvents.all().flatMap((row): RuntimeEvent[] => {
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
