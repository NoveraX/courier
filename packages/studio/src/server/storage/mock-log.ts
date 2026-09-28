/**
 * The requests Studio's mocks answered, kept in Studio's database as the
 * events their logs are made of, so a page that reloads, or a Studio that
 * restarts, shows a mock's log again.
 */

import type { DatabaseSync } from "node:sqlite";
import { withoutCredentials } from "./without-credentials";

type MockEvent = Record<string, unknown>;

/** As many requests as the Mocks view's log keeps. */
const MAX_REQUESTS = 500;

const LOGGED = new Set(["mock:request:start", "mock:request:end", "mock:request:error"]);

/** The mocks' request logs */
export interface MockLog {
  /** Keep an event a mock sent, if it is one of its log's; the event names its mock. */
  record(event: MockEvent): void;
  /** Every kept event, oldest first */
  events(): MockEvent[];
  /** Write what is kept to the database, and keep nothing more: the database is closing. */
  close(): void;
}

/**
 * The mocks' request logs, kept in a database.
 *
 * @param db - Studio's database
 * @returns The logs
 * @example
 * ```ts
 * const mockLog = createMockLog(db);
 * mockLog.record({ type: "mock:request:start", requestId: "req_1", serverId: "petstore" });
 * socket.emit("mock:events:replay", mockLog.events());
 * ```
 */
export function createMockLog(db: DatabaseSync): MockLog {
  const insert = db.prepare("INSERT INTO mock_events (request_id, body) VALUES (?, ?)");
  const drop = db.prepare("DELETE FROM mock_events WHERE request_id = ?");
  const selectAll = db.prepare("SELECT request_id, body FROM mock_events ORDER BY seq");
  const requests = new Set<string>();
  let pending: Array<{ id: string; event: MockEvent }> = [];
  let dropped: string[] = [];
  let scheduled = false;
  let closed = false;

  for (const row of selectAll.all()) requests.add(String(row.request_id));

  function flush(): void {
    scheduled = false;
    if (closed || pending.length + dropped.length === 0) return;
    const [writes, drops] = [pending, dropped];
    pending = [];
    dropped = [];
    db.exec("BEGIN");
    try {
      for (const id of drops) drop.run(id);
      for (const { id, event } of writes) insert.run(id, JSON.stringify(withoutCredentials(event)));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function keep(id: string, event: MockEvent): void {
    if (!requests.has(id)) {
      if (event.type !== "mock:request:start") return;
      requests.add(id);
      if (requests.size > MAX_REQUESTS) forgetOldest();
    }
    pending.push({ id, event });
    if (scheduled) return;
    scheduled = true;
    setImmediate(flush);
  }

  function forgetOldest(): void {
    const oldest = requests.values().next().value;
    if (oldest === undefined) return;
    requests.delete(oldest);
    pending = pending.filter((entry) => entry.id !== oldest);
    dropped.push(oldest);
  }

  return {
    record(event) {
      const id = event.requestId;
      if (typeof event.type !== "string" || !LOGGED.has(event.type) || typeof id !== "string")
        return;
      keep(id, event);
    },
    events() {
      flush();
      return selectAll.all().flatMap((row): MockEvent[] => {
        const value: unknown = typeof row.body === "string" ? JSON.parse(row.body) : undefined;
        return typeof value === "object" && value !== null && !Array.isArray(value)
          ? [{ ...value }]
          : [];
      });
    },
    close() {
      flush();
      closed = true;
    },
  };
}
