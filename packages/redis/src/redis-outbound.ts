import type { RefusalLog } from "@noverax/courier/internal";
import type { Redis } from "ioredis";

import type { OutboundLane, OutboundLimits, OutboundQueue } from "./outbound-queue";

/** The longest delay a timer holds; a wait past it is no bound at all. */
const MAX_TIMER_MS = 2_147_483_647;

/** What a pub/sub adapter has sent to Redis, and dropped. */
export interface OutboundCounts {
  published: number;
  dropped: number;
}

/** What a pub/sub adapter's commands to Redis go through. */
export interface OutboundParts {
  readonly publisher: Redis;
  readonly queue: OutboundQueue;
  readonly limits: OutboundLimits;
  readonly counts: OutboundCounts;
  readonly refusals: RefusalLog;
  /** Where a command Redis refused is reported */
  report(error: Error): void;
  /** Whether the adapter was stopped with `disconnect()` */
  stopped(): boolean;
}

/** What Redis has been sent and has not answered yet. */
export interface InFlight {
  readonly messages: number;
  readonly bytes: number;
}

/** How a pub/sub adapter's commands — a publish, an event appended to its log — reach Redis. */
export interface Outbound {
  /**
   * Send a command at once while Redis is ready, nothing waits, and what it
   * has yet to answer leaves room, settling once Redis answers it or once
   * it has waited `maxAgeMs`; or queue it, of `bytes`, in its lane, and
   * settle at once
   * @throws Error once the adapter is stopped
   */
  dispatch(command: () => Promise<unknown>, bytes: number, lane: OutboundLane): Promise<void>;
  /** Send what waits, the commands first, as far as what Redis has yet to answer leaves room */
  resume(): void;
  /** Count what was dropped, and log it once an interval */
  drop(count: number, code: string): void;
  /** What Redis has yet to answer, now */
  inFlight(): InFlight;
}

/**
 * The way a pub/sub adapter's commands reach Redis, over one connection in
 * the order they came. While Redis is ready, it sends each as long as what
 * Redis has yet to answer comes to fewer than `maxMessages`, and less than
 * `maxBytes` — the last sent may take it past, so a message larger than
 * that goes once its turn comes. Past that, and while Redis is away, they
 * wait in the queue, and go as Redis answers or comes back. A command is
 * counted until Redis answers it, as ioredis holds it until then; whoever
 * published it waits for that answer `maxAgeMs` at most. A command Redis
 * refuses is counted as dropped and reported, never thrown at whoever
 * published.
 *
 * @param parts - The publishing connection, the queue and its limits, the counts, and where refusals go
 * @returns The outbound path
 * @example
 * ```ts
 * const outbound = createOutbound({ publisher, queue, limits, counts, refusals, report, stopped });
 * await outbound.dispatch(() => publisher.publish(channel, payload), bytes, "events");
 * ```
 */
export function createOutbound(parts: OutboundParts): Outbound {
  const { publisher, queue, limits, counts, refusals } = parts;
  let messages = 0;
  let bytes = 0;

  function drop(count: number, code: string): void {
    if (count === 0) return;
    counts.dropped += count;
    refusals.warn({ event: "messages dropped", code, fields: { dropped: count } });
  }

  /* Redis there, and room left by what it has yet to answer. */
  function open(): boolean {
    return (
      publisher.status === "ready" &&
      !parts.stopped() &&
      messages < limits.maxMessages &&
      bytes < limits.maxBytes
    );
  }

  function send(command: () => Promise<unknown>, size: number): Promise<void> {
    messages++;
    bytes += size;
    const answered = (): void => {
      messages--;
      bytes -= size;
      resume();
    };
    return command().then(
      () => {
        counts.published++;
        answered();
      },
      (error: unknown) => {
        counts.dropped++;
        answered();
        parts.report(error instanceof Error ? error : new Error(String(error)));
      },
    );
  }

  function resume(): void {
    while (open()) {
      const { message, expired } = queue.take(Date.now());
      drop(expired, "QUEUE_EXPIRED");
      if (message === undefined) return;
      message.send();
    }
  }

  return {
    async dispatch(command, size, lane) {
      if (parts.stopped()) throw stoppedError();
      if (queue.messages === 0 && open()) {
        return waitAtMost(send(command, size), limits.maxAgeMs);
      }
      const at = Date.now();
      const message = { send: () => void send(command, size), bytes: size, at };
      const { expired, full } = queue.push(message, lane, at);
      drop(expired, "QUEUE_EXPIRED");
      drop(full, "QUEUE_FULL");
      resume();
    },
    resume,
    drop,
    inFlight: () => ({ messages, bytes }),
  };
}

/* What the publisher waits for: the answer, or `ms` — its command stays counted until it comes. */
function waitAtMost(answer: Promise<void>, ms: number): Promise<void> {
  if (ms > MAX_TIMER_MS) return answer;
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    /* A wait on Redis must not keep a server that is shutting down alive. */
    if (typeof timer === "object" && "unref" in timer) timer.unref();
    void answer.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * What a stopped pub/sub adapter rejects with.
 *
 * @returns The error
 * @example
 * ```ts
 * if (state.current === "stopped") throw stoppedError();
 * ```
 */
export function stoppedError(): Error {
  return new Error("The Redis pub/sub adapter was stopped with disconnect()");
}
