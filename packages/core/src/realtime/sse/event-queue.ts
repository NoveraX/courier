import { createLogger } from "../../logger";
import type { StreamEvent } from "../subscription-types";

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
  push(event: StreamEvent<TData>): void;
  /** Signal stream completion — resolves any waiting consumer */
  finish(): void;
  /** End the stream with an error — the consumer reads what is buffered, then it */
  fail(error: Error): void;
  /** Take every event held, oldest first, leaving none. */
  drain(): StreamEvent<TData>[];
  /** Every event held, oldest first, still held. */
  peek(): StreamEvent<TData>[];
  /** Let go of every event held. */
  clear(): void;
  /**
   * Create async iterator that drains this queue.
   *
   * @param onReturn - Called when the consumer stops early (`break`, or a
   *   throw in a `for await` body), so the stream behind it can be closed
   */
  iterator(onReturn?: () => void): AsyncIterableIterator<StreamEvent<TData>>;
  /** Number of dropped events due to overflow */
  readonly dropped: number;
  /** Current number of buffered events */
  readonly size: number;
}

/**
 * Create a push-pull event queue for SSE async iteration (ring buffer backed).
 *
 * When events arrive faster than they are read, the oldest buffered one is
 * dropped and counted in `dropped`; nothing is added to the stream, so every
 * event a reader gets is one the server sent. A warning is logged when a
 * reader falls behind, and the number dropped once it has caught up — not a
 * line per event, which would load the process just when it is overloaded.
 *
 * @param maxBufferSize - Maximum buffer capacity (default 1000)
 */
export function createEventQueue<TData>(
  maxBufferSize = DEFAULT_MAX_BUFFER_SIZE,
): EventQueue<TData> {
  let waiter:
    | {
        resolve: (value: IteratorResult<StreamEvent<TData>>) => void;
        reject: (error: Error) => void;
      }
    | undefined;
  let done = false;
  let failure: Error | undefined;
  let droppedCount = 0;
  /** Events dropped since the reader last caught up. */
  let droppedBehind = 0;

  const capacity = Math.max(1, maxBufferSize);
  const ring = new Array<StreamEvent<TData> | undefined>(capacity);
  let head = 0;
  let tail = 0;
  let count = 0;

  function enqueue(event: StreamEvent<TData>): void {
    if (count >= capacity) {
      head = (head + 1) % capacity;
      count--;
      droppedCount++;
      if (droppedBehind++ === 0) {
        log.warn(
          `Events arrive faster than they are read; dropping the oldest of ${capacity} buffered`,
        );
      }
    }
    ring[tail] = event;
    tail = (tail + 1) % capacity;
    count++;
  }

  function dequeue(): StreamEvent<TData> | undefined {
    if (count === 0) return undefined;
    const value = ring[head];
    head = (head + 1) % capacity;
    count--;
    if (count === 0 && droppedBehind > 0) {
      log.warn(`Dropped ${droppedBehind} event(s) while the reader was behind`);
      droppedBehind = 0;
    }
    return value;
  }

  function push(event: StreamEvent<TData>): void {
    if (waiter) {
      const { resolve } = waiter;
      waiter = undefined;
      resolve({ value: event, done: false });
    } else {
      enqueue(event);
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

  function next(): Promise<IteratorResult<StreamEvent<TData>>> {
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

  function drain(): StreamEvent<TData>[] {
    const taken: StreamEvent<TData>[] = [];
    for (let event = dequeue(); event; event = dequeue()) taken.push(event);
    return taken;
  }

  function peek(): StreamEvent<TData>[] {
    const held: StreamEvent<TData>[] = [];
    for (let i = 0; i < count; i++) {
      const event = ring[(head + i) % capacity];
      if (event) held.push(event);
    }
    return held;
  }

  function clear(): void {
    ring.fill(undefined);
    head = tail = count = 0;
  }

  function iterator(onReturn?: () => void): AsyncIterableIterator<StreamEvent<TData>> {
    return {
      next,
      async return() {
        /* Leaving a `for await` ends the subscription, so the connection is
           not left open and reconnecting until someone calls close(). */
        finish();
        clear();
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
    drain,
    peek,
    clear,
    iterator,
    get dropped() {
      return droppedCount;
    },
    get size() {
      return count;
    },
  };
}
