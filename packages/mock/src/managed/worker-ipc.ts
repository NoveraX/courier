/**
 * IPC helpers for the worker child process.
 * Handles communication with the Studio parent process.
 */

import type { ChildMessage } from "./types";

let queued: Record<string, unknown>[] = [];
let scheduled = false;

/**
 * End the worker when Studio goes away. The IPC channel closes the moment the
 * parent dies, however it died, so the worker never outlives it.
 */
export function watchParent(): void {
  process.once("disconnect", () => process.exit(0));
}

/**
 * Send Studio a message, after every event reported before it: a command's
 * result follows the changes the command made.
 *
 * @param msg - The message
 * @example
 * ```ts
 * send({ type: "command-result", requestId, ok: true });
 * ```
 */
export function send(msg: ChildMessage): void {
  flushEvents();
  process.send?.(msg);
}

/**
 * Report an event to Studio. Every event reported in one turn of the event
 * loop leaves together, in one message, once the turn is over: a mock under
 * load reports two and more for each request it answers, and a message
 * apiece cost the mock a write to the channel each, and Studio a message to
 * read and pass on to its pages each.
 *
 * @param event - The event
 * @example
 * ```ts
 * sendEvent({ type: "mock:request:error", requestId: id, status, message, duration });
 * ```
 */
export function sendEvent(event: Record<string, unknown>): void {
  queued.push(event);
  if (scheduled) return;
  scheduled = true;
  setImmediate(flushEvents);
}

function flushEvents(): void {
  scheduled = false;
  if (queued.length === 0) return;
  const events = queued;
  queued = [];
  try {
    process.send?.({ type: "events", events } satisfies ChildMessage);
  } catch {
    /* An event that is no JSON fails its whole batch: the others go without it. */
    sendOneByOne(events);
  }
}

function sendOneByOne(events: readonly Record<string, unknown>[]): void {
  for (const event of events) {
    try {
      process.send?.({ type: "events", events: [event] } satisfies ChildMessage);
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      process.send?.({
        type: "error",
        message: `A ${String(event.type)} event could not be sent to Studio: ${why}`,
        fatal: false,
      } satisfies ChildMessage);
    }
  }
}

export function sendError(message: string, fatal: boolean): void {
  send({ type: "error", message, fatal });
  if (fatal) process.exit(1);
}
