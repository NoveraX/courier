import { LIMITS } from "../../adapter/limits";

export interface MessageQueueConfig {
  /** Max messages to buffer (default 100) */
  maxCount?: number;
  /** Max total bytes to buffer (default 1MB) */
  maxBytes?: number;
}

export interface MessageQueue {
  /** Add a message to the buffer. Returns false if full (message dropped). */
  enqueue(msg: string): boolean;
  /** Return all buffered messages (control first, then data) and clear the queue. */
  drain(): string[];
  /** Clear the queue without returning messages. */
  clear(): void;
  /** Current number of buffered messages. */
  readonly size: number;
  /** Current total bytes buffered. */
  readonly bytes: number;
}

/** Matches `"type":"subscribe"` or `"type":"unsubscribe"` with optional whitespace */
const CONTROL_RE = /"type"\s*:\s*"(?:un)?subscribe"/;

/**
 * Creates an outbound message queue that buffers messages while reconnecting.
 * Control messages (subscribe/unsubscribe) are drained before data messages.
 *
 * @param config - Optional limits for count and byte size
 * @returns A MessageQueue instance
 */
export function createMessageQueue(config?: MessageQueueConfig): MessageQueue {
  const maxCount = config?.maxCount ?? LIMITS.MAX_QUEUE_COUNT;
  const maxBytes = config?.maxBytes ?? LIMITS.MAX_QUEUE_BYTES;

  let control: string[] = [];
  let data: string[] = [];
  let totalBytes = 0;

  return {
    enqueue(msg: string): boolean {
      const total = control.length + data.length;
      if (total >= maxCount) return false;
      if (totalBytes + msg.length > maxBytes) return false;
      if (CONTROL_RE.test(msg)) {
        control.push(msg);
      } else {
        data.push(msg);
      }
      totalBytes += msg.length;
      return true;
    },
    drain(): string[] {
      const msgs = [...control, ...data];
      control = [];
      data = [];
      totalBytes = 0;
      return msgs;
    },
    clear(): void {
      control = [];
      data = [];
      totalBytes = 0;
    },
    get size(): number {
      return control.length + data.length;
    },
    get bytes(): number {
      return totalBytes;
    },
  };
}
