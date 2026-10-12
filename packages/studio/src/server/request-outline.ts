/**
 * What a list of requests is made of: the events that open and end each
 * request the log keeps, without the bodies and headers they carry. Kept in
 * memory as the events arrive, so an editor's figures for every endpoint
 * and an agent's list of requests are read without going through every
 * event the database holds — validation, middleware and fetch events, and
 * each answer whole.
 */

type RuntimeEvent = Record<string, unknown>;

/* The events a request or a stream opens and ends with. */
const KEY_TYPES: ReadonlySet<string> = new Set([
  "request:start",
  "request:end",
  "request:error",
  "stream:open",
  "stream:close",
  "stream:error",
]);

/* What a list leaves to the request's own page: what it sent and was answered with. */
const BODY_FIELDS: ReadonlySet<string> = new Set([
  "data",
  "variables",
  "headers",
  "requestHeaders",
]);

/** The key events of the requests a log keeps. */
export interface RequestOutline {
  /** Take an event the log kept for a request; one that neither opens nor ends it is passed over. */
  see(requestId: string, event: RuntimeEvent): void;
  /** Forget a request the log let go. */
  drop(requestId: string): void;
  /** Every request's key events, the earliest request first, each request's in the order they came. */
  events(): RuntimeEvent[];
}

/**
 * The outline of a request log, starting from the key events its database
 * holds.
 *
 * @param stored - The key events the database holds, each with its request, in the order they came
 * @returns The outline, kept up to date by the log
 * @example
 * ```ts
 * const outline = createRequestOutline(rows.keyEvents());
 * outline.see("r1", { type: "request:end", requestId: "r1", status: 200, data: [] });
 * outline.events(); // [..., { type: "request:end", requestId: "r1", status: 200 }]
 * ```
 */
export function createRequestOutline(
  stored: Iterable<{ readonly id: string; readonly event: RuntimeEvent }>,
): RequestOutline {
  const byRequest = new Map<string, RuntimeEvent[]>();
  const see = (requestId: string, event: RuntimeEvent): void => {
    if (typeof event.type !== "string" || !KEY_TYPES.has(event.type)) return;
    const kept = withoutBodies(event);
    const events = byRequest.get(requestId);
    if (events) events.push(kept);
    else byRequest.set(requestId, [kept]);
  };
  for (const { id, event } of stored) see(id, event);
  return {
    see,
    drop: (requestId) => {
      byRequest.delete(requestId);
    },
    events: () => [...byRequest.values()].flat(),
  };
}

function withoutBodies(event: RuntimeEvent): RuntimeEvent {
  const kept: RuntimeEvent = {};
  for (const key of Object.keys(event)) {
    if (!BODY_FIELDS.has(key)) kept[key] = event[key];
  }
  return kept;
}
