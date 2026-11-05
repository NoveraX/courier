import type { RefusalLog } from "@noverax/courier/internal";
import type { Redis } from "ioredis";

import type { OutboundQueue } from "./outbound-queue";

/** What a pub/sub adapter has sent to Redis, and dropped. */
export interface OutboundCounts {
  published: number;
  dropped: number;
}

/** What a pub/sub adapter's commands to Redis go through. */
export interface OutboundParts {
  readonly publisher: Redis;
  readonly queue: OutboundQueue;
  readonly counts: OutboundCounts;
  readonly refusals: RefusalLog;
  /** Where a command Redis refused is reported */
  report(error: Error): void;
  /** Whether the adapter was stopped with `disconnect()` */
  stopped(): boolean;
}

/** How a pub/sub adapter's commands — a publish, an event appended to its log — reach Redis. */
export interface Outbound {
  /**
   * Run a command at once while Redis is there and nothing waits, or queue
   * it, of `bytes`, behind what does, in order
   * @throws Error once the adapter is stopped
   */
  dispatch(command: () => Promise<unknown>, bytes: number): Promise<void>;
  /** Send what waits, in order, dropping what waited longer than the queue keeps it: Redis is back */
  flush(): void;
  /** Count what was dropped, and log it once an interval */
  drop(count: number, code: string): void;
}

/**
 * The way a pub/sub adapter's commands reach Redis: at once while it is
 * there, or from the queue they wait in, in the order they came, once it
 * is back. A command Redis refuses is counted as dropped and reported,
 * never thrown at whoever published.
 *
 * @param parts - The publishing connection, the queue, the counts, and where refusals go
 * @returns The outbound path
 * @example
 * ```ts
 * const outbound = createOutbound({ publisher, queue, counts, refusals, report, stopped });
 * await outbound.dispatch(() => publisher.publish(channel, payload), Buffer.byteLength(payload));
 * ```
 */
export function createOutbound(parts: OutboundParts): Outbound {
  const { publisher, queue, counts, refusals } = parts;

  function drop(count: number, code: string): void {
    if (count === 0) return;
    counts.dropped += count;
    refusals.warn({ event: "messages dropped", code, fields: { dropped: count } });
  }

  function sent(command: () => Promise<unknown>): Promise<void> {
    return command().then(
      () => {
        counts.published++;
      },
      (error: unknown) => {
        counts.dropped++;
        parts.report(error instanceof Error ? error : new Error(String(error)));
      },
    );
  }

  return {
    async dispatch(command, bytes) {
      if (parts.stopped()) throw stoppedError();
      if (publisher.status === "ready" && queue.messages === 0) return sent(command);
      drop(
        queue.push(() => sent(command), bytes, Date.now()),
        "QUEUE_FULL",
      );
    },
    flush() {
      const { messages, expired } = queue.takeAll(Date.now());
      drop(expired, "QUEUE_EXPIRED");
      for (const message of messages) void message.send();
    },
    drop,
  };
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
