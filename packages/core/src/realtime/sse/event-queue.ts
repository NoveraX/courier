import { createLogger } from "../../logger";
import type { SSEEvent } from "../types";

const log = createLogger("SSE");

/** Default max buffer size for SSE event queues */
export const DEFAULT_MAX_BUFFER_SIZE = 1000;

/**
 * Push-pull queue bridging SSE connection events to async iterator consumption.
 * Uses a ring buffer for O(1) enqueue/dequeue instead of Array.shift().
 * If a consumer is waiting (pull), events are delivered immediately.
 * Otherwise events are buffered until next pull.
 */
export interface EventQueue<TData> {
  /** Push an event to waiting consumer or buffer it */
  push(event: SSEEvent<TData>): void;
  /** Signal stream completion — resolves any waiting consumer */
  finish(): void;
  /** End the stream with an error — the consumer reads what is buffered, then it */
  fail(error: Error): void;
  /**
   * Create async iterator that drains this queue.
   *
   * @param onReturn - Called when the consumer stops early (`break`, or a
   *   throw in a `for await` body), so the stream behind it can be closed
   */
  iterator(onReturn?: () => void): AsyncIterableIterator<SSEEvent<TData>>;
  /** Number of dropped events due to overflow */
  readonly dropped: number;
  /** Current number of buffered events */
  readonly size: number;
}

/**
 * Create a push-pull event queue for SSE async iteration (ring buffer backed).
 *
 * @param maxBufferSize - Maximum buffer capacity (default 1000). On overflow,
 *   the oldest event is dropped and an `overflow` event is emitted to the consumer.
 */
export function createEventQueue<TData>(
  maxBufferSize = DEFAULT_MAX_BUFFER_SIZE,
): EventQueue<TData> {
  let waiter:
    | {
        resolve: (value: IteratorResult<SSEEvent<TData>>) => void;
        reject: (error: Error) => void;
      }
    | undefined;
  let done = false;
  let failure: Error | undefined;
  let droppedCount = 0;
  /** Pending overflow event — delivered out-of-band (never enters ring buffer) */
  let pendingOverflow: SSEEvent<TData> | undefined;

  const capacity = Math.max(1, maxBufferSize);
  const ring = new Array<SSEEvent<TData> | undefined>(capacity);
  let head = 0;
  let tail = 0;
  let count = 0;

  function enqueue(event: SSEEvent<TData>): void {
    if (count >= capacity) {
      head = (head + 1) % capacity;
      count--;
      droppedCount++;
      log.warn(`EventQueue overflow — dropped oldest (total dropped: ${droppedCount})`);
    }
    ring[tail] = event;
    tail = (tail + 1) % capacity;
    count++;
  }

  function dequeue(): SSEEvent<TData> | undefined {
    // Deliver pending overflow notification before buffered events
    if (pendingOverflow) {
      const overflow = pendingOverflow;
      pendingOverflow = undefined;
      return overflow;
    }
    if (count === 0) return undefined;
    const value = ring[head];
    head = (head + 1) % capacity;
    count--;
    return value;
  }

  function push(event: SSEEvent<TData>): void {
    if (waiter) {
      const { resolve } = waiter;
      waiter = undefined;
      resolve({ value: event, done: false });
    } else {
      const prevDropped = droppedCount;
      enqueue(event);

      // Mark overflow for out-of-band delivery (no cascade)
      if (droppedCount > prevDropped) {
        pendingOverflow = {
          event: "overflow",
          data: { dropped: droppedCount } as unknown as TData,
        } as SSEEvent<TData>;
      }
    }
  }

  function finish(): void {
    end(undefined);
  }

  function fail(error: Error): void {
    end(error);
  }

  function end(error: Error | undefined): void {
    if (done) return;
    done = true;
    failure = error;
    const waiting = waiter;
    if (!waiting) return;
    waiter = undefined;
    next().then(waiting.resolve, waiting.reject);
  }

  function next(): Promise<IteratorResult<SSEEvent<TData>>> {
    const value = dequeue();
    if (value) return Promise.resolve({ value, done: false });
    if (!done) {
      return new Promise((resolve, reject) => {
        waiter = { resolve, reject };
      });
    }
    const error = failure;
    failure = undefined;
    return error ? Promise.reject(error) : Promise.resolve({ value: undefined, done: true });
  }

  function iterator(onReturn?: () => void): AsyncIterableIterator<SSEEvent<TData>> {
    return {
      next,
      async return() {
        /* Leaving a `for await` used to leave the connection open and
           reconnecting until someone remembered to call close(). */
        finish();
        head = tail = count = 0;
        pendingOverflow = undefined;
        onReturn?.();
        return { value: undefined, done: true };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  return {
    push,
    finish,
    fail,
    iterator,
    get dropped() {
      return droppedCount;
    },
    get size() {
      return count;
    },
  };
}
