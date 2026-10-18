/**
 * What a list of requests is made of: the events that open and end each
 * request the log keeps, and how each stream's connection stands now,
 * without the bodies and headers they carry. Kept in
 * memory as the events arrive, so an editor's figures for every endpoint
 * and an agent's list of requests are read without going through every
 * event the database holds — validation, middleware and fetch events, and
 * each answer whole. Only an agent and an editor read it, past the page
 * that holds Studio's token, so it keeps each event as it leaves that page:
 * its error's text and its cause cut.
 */

import { withoutSecretTexts } from "./secrets/without-secret-texts";

type RuntimeEvent = Record<string, unknown>;

/* The events a request or a stream opens and ends with, and how a stream's connection stands. */
const KEY_TYPES: ReadonlySet<string> = new Set([
  "request:start",
  "request:end",
  "request:error",
  "stream:open",
  "stream:close",
  "stream:error",
  "stream:status",
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
    const kept = withoutSecretTexts(withoutBodies(event));
    const events = byRequest.get(requestId);
    if (!events) {
      byRequest.set(requestId, [kept]);
      return;
    }
    /* How a stream's connection stands replaces how it stood, as the log's rows keep it. */
    if (kept.type === "stream:status") {
      const before = events.findIndex((e) => e.type === "stream:status");
      if (before !== -1) events.splice(before, 1);
    }
    events.push(kept);
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

/**
 * An outline read from the database only when first asked for its events,
 * not as Studio starts: a full log takes a fifth of a second to go through,
 * and a Studio whose pages only show the Timeline never asks. Until then
 * it takes nothing in: what it would, it finds in the database.
 *
 * @param stored - Reads the key events the database holds, once everything kept was written
 * @returns The outline
 * @example
 * ```ts
 * const outline = lazyRequestOutline(() => {
 *   flush();
 *   return rows.keyEvents();
 * });
 * ```
 */
export function lazyRequestOutline(
  stored: () => Iterable<{ readonly id: string; readonly event: RuntimeEvent }>,
): RequestOutline {
  let outline: RequestOutline | undefined;
  return {
    see: (requestId, event) => outline?.see(requestId, event),
    drop: (requestId) => outline?.drop(requestId),
    events: () => {
      outline ??= createRequestOutline(stored());
      return outline.events();
    },
  };
}
