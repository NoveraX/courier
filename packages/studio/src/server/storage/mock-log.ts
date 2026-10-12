/**
 * The requests Studio's mocks answered, kept in Studio's database as the
 * events their logs are made of, so a page that reloads, or a Studio that
 * restarts, shows a mock's log again.
 */

import type { DatabaseSync } from "node:sqlite";
import { REPLAY_BYTES } from "./replay-bytes";
import { withoutCredentials } from "./without-credentials";

type MockEvent = Record<string, unknown>;

/** As many requests as the Mocks view's log keeps. */
export const MOCK_LOG_REQUESTS: number = 500;

const LOGGED = new Set(["mock:request:start", "mock:request:end", "mock:request:error"]);

/** The mocks' request logs */
export interface MockLog {
  /** Keep an event a mock sent, if it is one of its log's; the event names its mock. */
  record(event: MockEvent): void;
  /** The kept events a page is sent as it connects, oldest first: the newest requests', each whole, as many as fit the replay. */
  events(): MockEvent[];
  /** What `events` returns, as the message a page is sent: their JSON array in UTF-8, as the database keeps it — never parsed and written out again. */
  replayPayload(): Uint8Array;
  /** Forget every request every mock answered, as the Storage settings' Clear does. */
  forgetAll(): void;
  /** Forget every request one mock answered, as its page's Clear does. */
  forget(serverId: string): void;
  /** Write what is kept to the database, and keep nothing more: the database is closing. */
  close(): void;
}

/**
 * The mocks' request logs, kept in a database.
 *
 * @param db - Studio's database
 * @param replayBytes - The most of the log a page is sent as it connects
 * @returns The logs
 * @example
 * ```ts
 * const mockLog = createMockLog(db);
 * mockLog.record({ type: "mock:request:start", requestId: "req_1", serverId: "petstore" });
 * socket.emit("mock:events:replay", mockLog.replayPayload());
 * ```
 */
export function createMockLog(db: DatabaseSync, replayBytes: number = REPLAY_BYTES): MockLog {
  const insert = db.prepare("INSERT INTO mock_events (request_id, body) VALUES (?, ?)");
  const drop = db.prepare("DELETE FROM mock_events WHERE request_id = ?");
  const selectAll = db.prepare("SELECT request_id, body FROM mock_events ORDER BY seq");
  /* The newest requests whose events fit the replay, each whole, oldest first. */
  const selectReplay = db.prepare(
    "WITH sized AS (SELECT request_id, MIN(seq) AS first, SUM(LENGTH(body)) AS bytes " +
      "FROM mock_events GROUP BY request_id), " +
      "kept AS (SELECT request_id, " +
      "SUM(bytes) OVER (ORDER BY first DESC ROWS UNBOUNDED PRECEDING) AS upto FROM sized) " +
      "SELECT m.body FROM mock_events m JOIN kept k ON k.request_id = m.request_id " +
      "WHERE k.upto <= ? ORDER BY m.seq",
  );
  const requests = new Set<string>();
  /* The mock each kept request was answered by, so one mock's log can be forgotten alone. */
  const owners = new Map<string, string>();
  let pending: Array<{ id: string; event: MockEvent }> = [];
  /* The requests with events in `pending`: only one of them has any to take back. */
  const waiting = new Set<string>();
  let dropped: string[] = [];
  let scheduled = false;
  let closed = false;

  for (const row of selectAll.all()) {
    const id = String(row.request_id);
    requests.add(id);
    const owner = serverIdOf(typeof row.body === "string" ? JSON.parse(row.body) : undefined);
    if (owner) owners.set(id, owner);
  }

  function flush(): void {
    scheduled = false;
    if (closed || pending.length + dropped.length === 0) return;
    const [writes, drops] = [pending, dropped];
    pending = [];
    waiting.clear();
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
      const owner = serverIdOf(event);
      if (owner) owners.set(id, owner);
      if (requests.size > MOCK_LOG_REQUESTS) forgetOldest();
    }
    pending.push({ id, event });
    waiting.add(id);
    schedule();
  }

  function schedule(): void {
    if (scheduled) return;
    scheduled = true;
    setImmediate(flush);
  }

  function forgetRequest(id: string): void {
    requests.delete(id);
    owners.delete(id);
    if (waiting.delete(id)) pending = pending.filter((entry) => entry.id !== id);
    dropped.push(id);
  }

  function forgetOldest(): void {
    const oldest = requests.values().next().value;
    if (oldest !== undefined) forgetRequest(oldest);
  }

  return {
    record(event) {
      const id = event.requestId;
      if (typeof event.type !== "string" || !LOGGED.has(event.type) || typeof id !== "string")
        return;
      keep(id, event);
    },
    replayPayload() {
      flush();
      const bodies = selectReplay.all(replayBytes).map((row) => String(row.body));
      return Buffer.from(`[${bodies.join(",")}]`, "utf8");
    },
    events() {
      flush();
      return selectReplay.all(replayBytes).flatMap((row): MockEvent[] => {
        const value: unknown = typeof row.body === "string" ? JSON.parse(row.body) : undefined;
        return typeof value === "object" && value !== null && !Array.isArray(value)
          ? [{ ...value }]
          : [];
      });
    },
    forgetAll() {
      for (const id of [...requests]) forgetRequest(id);
      flush();
    },
    forget(serverId) {
      for (const [id, owner] of owners) if (owner === serverId) forgetRequest(id);
      schedule();
    },
    close() {
      flush();
      closed = true;
    },
  };
}

function serverIdOf(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("serverId" in value)) return undefined;
  return typeof value.serverId === "string" ? value.serverId : undefined;
}
