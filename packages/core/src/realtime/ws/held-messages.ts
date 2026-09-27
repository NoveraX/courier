import { LIMITS } from "../../adapter/limits";
import type { MessageQueueConfig } from "./message-queue";

/** A message sent on a subscription the server has not confirmed yet. */
export interface HeldMessage {
  payload: unknown;
  /** Correlation id, when the message expects a reply */
  id?: string;
}

/** Messages held for one subscription until the server confirms it. */
export interface HeldMessages {
  /** Hold a message. Returns false when the limits are reached and it was dropped. */
  hold(message: HeldMessage): boolean;
  /** Everything held, oldest first, leaving nothing behind. */
  take(): HeldMessage[];
  /**
   * Move everything held here to the end of `target`, within its limits.
   * Returns how many did not fit and were dropped.
   */
  moveTo(target: HeldMessages): number;
  /** Number of messages held. */
  readonly size: number;
}

/**
 * Create the buffer that holds a subscription's messages until the server
 * confirms it, within the same limits as the connection's message queue.
 *
 * The topic is left out of what is held: the server may confirm the
 * subscription under another topic than the one the client asked for, and
 * the messages go out under that one.
 *
 * @param config - Count and byte limits (defaults as the message queue's)
 * @returns An empty buffer
 *
 * @example
 * const held = createHeldMessages();
 * held.hold({ payload: { text: "hi" } });
 * held.take(); // [{ payload: { text: "hi" } }]
 */
export function createHeldMessages(config?: MessageQueueConfig): HeldMessages {
  const maxCount = config?.maxCount ?? LIMITS.MAX_QUEUE_COUNT;
  const maxBytes = config?.maxBytes ?? LIMITS.MAX_QUEUE_BYTES;
  let messages: { message: HeldMessage; bytes: number }[] = [];
  let totalBytes = 0;

  function push(message: HeldMessage, bytes: number): boolean {
    if (messages.length >= maxCount || totalBytes + bytes > maxBytes) return false;
    messages.push({ message, bytes });
    totalBytes += bytes;
    return true;
  }

  function take(): HeldMessage[] {
    const taken = messages.map((entry) => entry.message);
    messages = [];
    totalBytes = 0;
    return taken;
  }

  return {
    hold: (message) => push(message, JSON.stringify(message.payload ?? null).length),
    take,
    moveTo(target) {
      return take().filter((message) => !target.hold(message)).length;
    },
    get size() {
      return messages.length;
    },
  };
}
