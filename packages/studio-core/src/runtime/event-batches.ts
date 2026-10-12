import { createLogger } from "@noverax/courier";
import type { AnyStudioEvent } from "../events";

const log = createLogger("Studio");

/**
 * The most characters of events one message carries. A busy server reports
 * hundreds of events in one turn of its event loop, and Studio reads each
 * message whole before the next; three bytes a character, it stays inside
 * the smallest limit a Studio sets on what it takes.
 */
const BATCH_CHARACTERS = 128 * 1024;

/** Where the batches go: the runtime's socket to Studio. */
export interface EventBatchesTarget {
  /** Send one batch: the events as a JSON array, as UTF-8 bytes where the platform encodes them. */
  send(batch: Uint8Array | string): void;
  /** Whether the socket is connected now. */
  connected(): boolean;
  /** Keep an event to send once the socket connects again. */
  keep(event: AnyStudioEvent): void;
  /** The most bytes Studio takes in one message; `Infinity` while it has not said. */
  most(): number;
}

/** The events on their way to Studio. */
export interface EventBatches {
  /** Queue an event: it goes out with every other one reported in the same turn of the event loop. */
  add(event: AnyStudioEvent): void;
  /** Send what is queued now, ahead of a message that must follow it. */
  flush(): void;
}

const encoder = typeof TextEncoder === "function" ? new TextEncoder() : undefined;

/* Once the turn ends, where the platform says when that is; at the next timer elsewhere. */
const afterTurn: (run: () => void) => void =
  typeof setImmediate === "function"
    ? (run) => void setImmediate(run)
    : (run) => void setTimeout(run, 0);

/**
 * Send a runtime's events to Studio in batches: everything reported in one
 * turn of the event loop leaves together, as one message, once the turn is
 * over. A server reports more than a dozen events for each call it serves,
 * and a message apiece cost it a write to its socket for each — with Studio
 * attached, it served half the calls it serves without.
 *
 * An event that cannot be sent as JSON, or is larger on its own than Studio
 * takes in a message, is left out and said in the log: Studio closes a
 * connection that brings it one too large, and everything else in flight
 * goes with it.
 *
 * @param target - The socket the batches go to
 * @returns The queue of events to send
 * @example
 * ```ts
 * const batches = eventBatches({
 *   send: (batch) => socket.emit("events", batch),
 *   connected: () => socket.connected,
 *   keep: unsent.keep,
 *   most: limit.most,
 * });
 * bus.on((event) => batches.add(event));
 * ```
 */
export function eventBatches(target: EventBatchesTarget): EventBatches {
  let queued: AnyStudioEvent[] = [];
  let scheduled = false;
  const warned = new Set<string>();

  function warnOnce(key: string, message: string, error?: unknown): void {
    if (warned.has(key)) return;
    warned.add(key);
    log.warn(message, error);
  }

  function textOf(event: AnyStudioEvent): string | undefined {
    try {
      return JSON.stringify(event);
    } catch (error) {
      warnOnce(`json:${event.type}`, `A ${event.type} event could not be sent to Studio`, error);
      return undefined;
    }
  }

  function fits(text: string, most: number): boolean {
    if (text.length * 3 + 2 <= most) return true;
    const bytes = encoder ? encoder.encode(text).length : text.length;
    return bytes + 2 <= most;
  }

  function send(parts: readonly string[]): void {
    const text = `[${parts.join(",")}]`;
    target.send(encoder ? encoder.encode(text) : text);
  }

  function sendAll(events: readonly AnyStudioEvent[]): void {
    const most = target.most();
    const cap = Math.min(BATCH_CHARACTERS, Math.floor(most / 3));
    let parts: string[] = [];
    let size = 0;
    for (const event of events) {
      const text = textOf(event);
      if (text === undefined) continue;
      if (!fits(text, most)) {
        warnOnce(
          `size:${event.type}`,
          `A ${event.type} event is larger than Studio takes in one message, and was not sent`,
        );
        continue;
      }
      if (parts.length > 0 && size + text.length + 1 > cap) {
        send(parts);
        parts = [];
        size = 0;
      }
      parts.push(text);
      size += text.length + 1;
    }
    if (parts.length > 0) send(parts);
  }

  function flush(): void {
    scheduled = false;
    if (queued.length === 0) return;
    const events = queued;
    queued = [];
    if (!target.connected()) {
      for (const event of events) target.keep(event);
      return;
    }
    sendAll(events);
  }

  return {
    add(event) {
      queued.push(event);
      if (scheduled) return;
      scheduled = true;
      afterTurn(flush);
    },
    flush,
  };
}
