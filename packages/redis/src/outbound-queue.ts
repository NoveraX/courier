import { ConfigurationError } from "@noverax/courier";

/** How much a pub/sub adapter holds while Redis is away. */
export interface OutboundLimits {
  /** Messages at most (default 1000) */
  readonly maxMessages: number;
  /** Bytes of their payloads at most (default 1 MiB) */
  readonly maxBytes: number;
  /** How long one may wait before it is no longer worth sending (default 5 s) */
  readonly maxAgeMs: number;
}

/** The limits a pub/sub adapter keeps when its config names none. */
const OUTBOUND_LIMITS: OutboundLimits = {
  maxMessages: 1_000,
  maxBytes: 1_048_576,
  maxAgeMs: 5_000,
};

/** A message waiting to be published, or an event to be appended to the log. */
export interface QueuedMessage {
  /** Send it, once Redis is back */
  readonly send: () => Promise<void>;
  readonly bytes: number;
  readonly at: number;
}

/** Messages waiting for Redis, in the order they were published. */
export interface OutboundQueue {
  /** Queue one, of `bytes`; returns how many were dropped for it — the oldest, or itself when it can never fit */
  push(send: () => Promise<void>, bytes: number, now: number): number;
  /** Take every message in order; those older than `maxAgeMs` are dropped and counted */
  takeAll(now: number): { messages: QueuedMessage[]; expired: number };
  /** Drop every message; returns how many */
  clear(): number;
  readonly messages: number;
  readonly bytes: number;
}

/**
 * The queue a pub/sub adapter keeps what is published while Redis is away
 * in. A replica that published for minutes into an outage would otherwise
 * hold it all and send it at once on return, long after it mattered; so
 * it is bounded by count, bytes and age, and the oldest go first.
 *
 * @param asked - Its bounds, as the adapter's config names them; the defaults for the rest
 * @returns The queue
 * @throws ConfigurationError for a bound that is no number, or below 1 (below 0 for `maxAgeMs`)
 * @example
 * ```ts
 * const queue = createOutboundQueue({ maxMessages: 10_000 });
 * dropped += queue.push(() => publish(channel, payload), Buffer.byteLength(payload), Date.now());
 * ```
 */
export function createOutboundQueue(asked: Partial<OutboundLimits> | undefined): OutboundQueue {
  const limits = limitsOf(asked);
  let waiting: QueuedMessage[] = [];
  let bytes = 0;

  function dropOldest(): void {
    const oldest = waiting.shift();
    if (oldest) bytes -= oldest.bytes;
  }

  return {
    push(send, size, now) {
      if (size > limits.maxBytes) return 1;
      let dropped = 0;
      while (
        waiting.length > 0 &&
        (waiting.length >= limits.maxMessages || bytes + size > limits.maxBytes)
      ) {
        dropOldest();
        dropped++;
      }
      waiting.push({ send, bytes: size, at: now });
      bytes += size;
      return dropped;
    },
    takeAll(now) {
      const taken = waiting;
      waiting = [];
      bytes = 0;
      const messages = taken.filter((message) => now - message.at <= limits.maxAgeMs);
      return { messages, expired: taken.length - messages.length };
    },
    clear() {
      const count = waiting.length;
      waiting = [];
      bytes = 0;
      return count;
    },
    get messages() {
      return waiting.length;
    },
    get bytes() {
      return bytes;
    },
  };
}

/**
 * The limits a pub/sub adapter keeps: its defaults, with what its config
 * names in their place.
 *
 * @param asked - The limits the config names
 * @returns The limits
 * @throws ConfigurationError for a limit that is no number, or below 1 (below 0 for `maxAgeMs`)
 */
function limitsOf(asked: Partial<OutboundLimits> | undefined): OutboundLimits {
  const limits = { ...OUTBOUND_LIMITS, ...asked };
  for (const [name, value] of Object.entries(limits)) {
    const least = name === "maxAgeMs" ? 0 : 1;
    if (!Number.isFinite(value) || value < least) {
      throw new ConfigurationError(
        "PUBSUB_OPTIONS_INVALID",
        `[courier] createRedisPubSub({ queue: { ${name} } }) takes a number of at least ${least}, not ${String(value)}.`,
      );
    }
  }
  return limits;
}
