import type { EventPayload } from "./actions-event-utils";
import { applyEvents } from "./apply-events";
import { str } from "./event-helpers";
import type { RequestEntry } from "./types";

export interface HoldOptions {
  /** How many requests the lists keep. */
  maxRequests: number;
  /** Patterns of requests the user chose not to record. */
  ignorePatterns: string[];
}

/* The request an event belongs to: a start names it by `id`, every other
   event by `requestId`. */
function requestIdOf(event: EventPayload): string {
  return event.type === "request:start" ? str(event.id) : str(event.requestId);
}

/**
 * Fold a batch of events into the requests held while recording is paused:
 * the ones that begin during the pause, kept out of the list until it
 * resumes, and every later event of theirs. An event of a request the list
 * shows is the list's, so a request is never held twice.
 *
 * @param held - The requests held so far, newest first
 * @param shown - The requests the list shows
 * @param events - The events, oldest first
 * @param options - The cap and the ignore patterns
 * @returns The held requests after the batch — the same array when no event changed them
 *
 * @example
 * ```ts
 * const heldRequests = holdEvents(state.heldRequests, state.requests, batch, options);
 * ```
 */
export function holdEvents(
  held: RequestEntry[],
  shown: readonly RequestEntry[],
  events: readonly EventPayload[],
  options: HoldOptions,
): RequestEntry[] {
  const shownIds = new Set(shown.map((r) => r.id));
  const theirs = events.filter((event) => !shownIds.has(requestIdOf(event)));
  if (theirs.length === 0) return held;
  return applyEvents(held, theirs, { ...options, paused: false }).requests;
}

/**
 * The list once recording resumes: the held requests on top of the ones
 * shown, newest first, within the cap.
 *
 * @param held - The requests held during the pause, newest first
 * @param shown - The requests the list showed, newest first
 * @param maxRequests - How many requests the list keeps
 * @returns The list, and how many old requests the cap dropped
 *
 * @example
 * ```ts
 * const { requests, droppedCount } = releaseHeld(state.heldRequests, state.requests, 2000);
 * ```
 */
export function releaseHeld(
  held: readonly RequestEntry[],
  shown: readonly RequestEntry[],
  maxRequests: number,
): { requests: RequestEntry[]; droppedCount: number } {
  const all = [...held, ...shown];
  const requests = all.slice(0, maxRequests);
  return { requests, droppedCount: all.length - requests.length };
}
