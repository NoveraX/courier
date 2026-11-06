import { ConfigurationError } from "../../errors/configuration-error";
import { LIMITS } from "../../limits";

export interface MessageQueueConfig {
  /** Max messages a connection keeps to send, for all its subscriptions together (default 100) */
  maxCount?: number | undefined;
  /** Max bytes it keeps, as their frames are encoded (default 1 MB) */
  maxBytes?: number | undefined;
  /**
   * What a message that finds no room does: with `"reject"`, it is not kept
   * and its `send` answers `false`; with `"drop-oldest"`, it is kept, and the
   * oldest message waiting goes instead — its channel hears a 4429 error
   * (default `"reject"`)
   */
  overflow?: "reject" | "drop-oldest" | undefined;
}

/** A message kept until it can go out. */
export interface QueuedMessage<TOwner> {
  /** The subscription it waits for the server to confirm, if it waits for one */
  readonly owner: TOwner | undefined;
  readonly topic: string;
  readonly payload: unknown;
  /** Its frame's length, as the limits count it */
  readonly bytes: number;
}

/** What a connection keeps to send while it cannot: one queue, one budget. */
export interface MessageQueue<TOwner> {
  /** Keep a message. `false` when it was not kept. */
  push(message: QueuedMessage<TOwner>): boolean;
  /** Take out what waits for `owner` — `undefined` for no subscription — oldest first. */
  take(owner: TOwner | undefined): QueuedMessage<TOwner>[];
  /** What waited for `from` waits for `into`: the server took both subscriptions for one. */
  retarget(from: TOwner, into: TOwner): void;
  /** Let go of what waits for `owner`, which ended. Returns how many. */
  forget(owner: TOwner): number;
  /** Let go of everything. Returns how many. */
  clear(): number;
  readonly size: number;
  readonly bytes: number;
}

/**
 * Create the queue a connection keeps what it cannot send yet in: messages
 * sent while it reconnects, and those sent on a subscription the server has
 * not confirmed — sent at once, those reach a server still checking the
 * subscribe, and are refused as not subscribed. One budget holds them all:
 * kept per subscription, a connection with a hundred subscriptions could
 * hold a hundred times as much.
 *
 * @param config - Its limits, and what overflowing them does
 * @param onDrop - Told of each message dropped to make room for a newer one
 * @returns The empty queue
 * @throws {ConfigurationError} `INVALID_MESSAGE_QUEUE` for a limit that is not a whole number from 0, or an unknown `overflow`
 * @example
 * ```ts
 * const queue = createMessageQueue<Subscription>({ overflow: "drop-oldest" }, (dropped) => warn(dropped.topic));
 * queue.push({ owner: undefined, topic: "api.chat.room", payload: { text: "hi" }, bytes: 52 });
 * ```
 */
export function createMessageQueue<TOwner>(
  config: MessageQueueConfig = {},
  onDrop: (dropped: QueuedMessage<TOwner>) => void = () => undefined,
): MessageQueue<TOwner> {
  const { maxCount, maxBytes, overflow } = resolveQueueConfig(config);
  let messages: QueuedMessage<TOwner>[] = [];
  let bytes = 0;

  const fits = (message: QueuedMessage<TOwner>): boolean =>
    messages.length < maxCount && bytes + message.bytes <= maxBytes;

  function keep(next: QueuedMessage<TOwner>[]): number {
    const left = messages.length - next.length;
    messages = next;
    bytes = next.reduce((sum, message) => sum + message.bytes, 0);
    return left;
  }

  return {
    push(message) {
      if (message.bytes > maxBytes || maxCount === 0) return false;
      if (!fits(message) && overflow === "reject") return false;
      while (!fits(message)) {
        const oldest = messages.shift();
        if (oldest === undefined) return false;
        bytes -= oldest.bytes;
        onDrop(oldest);
      }
      messages.push(message);
      bytes += message.bytes;
      return true;
    },
    take(owner) {
      const taken = messages.filter((message) => message.owner === owner);
      keep(messages.filter((message) => message.owner !== owner));
      return taken;
    },
    retarget(from, into) {
      messages = messages.map((message) =>
        message.owner === from ? { ...message, owner: into } : message,
      );
    },
    forget: (owner) => keep(messages.filter((message) => message.owner !== owner)),
    clear: () => keep([]),
    get size() {
      return messages.length;
    },
    get bytes() {
      return bytes;
    },
  };
}

function resolveQueueConfig(config: MessageQueueConfig): Required<{
  [TKey in keyof MessageQueueConfig]-?: Exclude<MessageQueueConfig[TKey], undefined>;
}> {
  const maxCount = config.maxCount ?? LIMITS.MAX_QUEUE_COUNT;
  const maxBytes = config.maxBytes ?? LIMITS.MAX_QUEUE_BYTES;
  const overflow = config.overflow ?? "reject";
  for (const [name, value] of [
    ["maxCount", maxCount],
    ["maxBytes", maxBytes],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) invalid(`messageQueue.${name} is ${value}`);
  }
  if (overflow !== "reject" && overflow !== "drop-oldest") {
    invalid(`messageQueue.overflow is ${String(overflow)}`);
  }
  return { maxCount, maxBytes, overflow };
}

function invalid(what: string): never {
  throw new ConfigurationError(
    "INVALID_MESSAGE_QUEUE",
    `[courier] ${what}: a limit is a whole number from 0, and overflow "reject" or "drop-oldest".`,
  );
}
