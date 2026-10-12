import type { RequestBatch, RequestRows, StoredRequest } from "./storage/request-rows";

type RuntimeEvent = Record<string, unknown>;

/** What the request log has changed, waiting to be written. */
export interface RequestLogWrites {
  /** Write a request's event, and its row as it then stands. */
  event(id: string, event: RuntimeEvent): void;
  /** Delete a request, taking back the events of it still waiting. */
  drop(id: string): void;
  /** Write what waits now. */
  flush(): void;
  /** Write what waits, and nothing more: the database is closing. */
  close(): void;
}

/**
 * Gather the request log's writes and make them once a turn of the event
 * loop, in one transaction: every event a turn brought, the row of every
 * request they changed, and the requests let go.
 *
 * @param rows - The log's rows in the database
 * @param rowOf - A request's row as the log holds it now; none for one it let go
 * @returns The writes
 * @example
 * ```ts
 * const writes = requestLogWrites(rows, (id) => rowOf(requests.get(id)));
 * writes.event("r1", event);
 * ```
 */
export function requestLogWrites(
  rows: Pick<RequestRows, "write">,
  rowOf: (id: string) => StoredRequest | undefined,
): RequestLogWrites {
  let batch: RequestBatch = { events: [], requests: [], dropped: [] };
  const changed = new Set<string>();
  let scheduled = false;
  let closed = false;

  function flush(): void {
    scheduled = false;
    if (closed) return;
    for (const id of changed) {
      const row = rowOf(id);
      if (row) batch.requests.push(row);
    }
    changed.clear();
    if (batch.events.length + batch.requests.length + batch.dropped.length === 0) return;
    const written = batch;
    batch = { events: [], requests: [], dropped: [] };
    rows.write(written);
  }

  return {
    event(id, event) {
      batch.events.push({ id, event });
      changed.add(id);
      if (scheduled) return;
      scheduled = true;
      setImmediate(flush);
    },
    drop(id) {
      /* Only a request with events still waiting to be written has any to take back. */
      if (changed.delete(id)) batch.events = batch.events.filter((entry) => entry.id !== id);
      batch.dropped.push(id);
    },
    flush,
    close() {
      flush();
      closed = true;
    },
  };
}
