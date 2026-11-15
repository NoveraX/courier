import { ConfigurationError } from "@noverax/courier/server";

/** How much a pub/sub adapter holds: sent to Redis and not yet answered, and waiting to be sent. */
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

/** What a message waiting to be sent is: a command of Courier's for the replicas, or an event. */
export type OutboundLane = "commands" | "events";

/** A message waiting to be published, or an event to be appended to the log. */
export interface QueuedMessage {
  /** Send it, once its turn comes */
  readonly send: () => void;
  readonly bytes: number;
  readonly at: number;
}

/** What a queue let go of to take a message in. */
export interface QueueDrops {
  /** Those that had waited longer than `maxAgeMs` */
  readonly expired: number;
  /** Those let go of to make room, the message itself when none could be made */
  readonly full: number;
}

/** Messages waiting to be sent, the commands apart from the events, each in the order it came. */
export interface OutboundQueue {
  /**
   * Queue one in its lane. What has waited longer than `maxAgeMs` goes
   * first; then, past the bounds, the oldest events, and for a command the
   * oldest commands once no event is left. An event takes no command's
   * place: one with no room but theirs is let go of itself
   */
  push(message: QueuedMessage, lane: OutboundLane, now: number): QueueDrops;
  /** The next to send — the oldest command, else the oldest event — what waited too long let go of */
  take(now: number): { readonly message: QueuedMessage | undefined; readonly expired: number };
  /** Let go of every message; returns how many */
  clear(): number;
  readonly messages: number;
  readonly bytes: number;
}

interface Lane {
  readonly waiting: QueuedMessage[];
  bytes: number;
}

/**
 * The queue a pub/sub adapter keeps what it cannot send yet in: while
 * Redis is away, and past what Redis may have unanswered. A replica that
 * published for minutes into an outage would otherwise hold it all and
 * send it at once on return, long after it mattered; so it is bounded by
 * count, bytes and age, and the oldest go first. Courier's commands — a
 * user's connections closed, their credentials asked for again — wait
 * apart, go before the events, and are never let go of for one.
 *
 * @param limits - Its bounds, from {@link outboundLimits}
 * @returns The queue
 * @example
 * ```ts
 * const queue = createOutboundQueue(outboundLimits({ maxMessages: 10_000 }));
 * const { expired, full } = queue.push({ send, bytes, at: Date.now() }, "events", Date.now());
 * ```
 */
export function createOutboundQueue(limits: OutboundLimits): OutboundQueue {
  const commands: Lane = { waiting: [], bytes: 0 };
  const events: Lane = { waiting: [], bytes: 0 };
  const lanes: Record<OutboundLane, Lane> = { commands, events };
  const count = (): number => commands.waiting.length + events.waiting.length;
  const held = (): number => commands.bytes + events.bytes;

  function shift(lane: Lane): QueuedMessage | undefined {
    const first = lane.waiting.shift();
    if (first !== undefined) lane.bytes -= first.bytes;
    return first;
  }

  /* Each lane is in the order its messages came, so what waited too long is at its head. */
  function expire(now: number): number {
    let expired = 0;
    for (const lane of [commands, events]) {
      for (let first = lane.waiting[0]; first !== undefined; first = lane.waiting[0]) {
        if (now - first.at <= limits.maxAgeMs) break;
        shift(lane);
        expired++;
      }
    }
    return expired;
  }

  /* Whether a message of `bytes` fits beside `others` messages of `othersBytes`. */
  function fits(others: number, othersBytes: number, bytes: number): boolean {
    return others < limits.maxMessages && othersBytes + bytes <= limits.maxBytes;
  }

  return {
    push(message, lane, now) {
      const expired = expire(now);
      /* An event can make room of the events alone, a command of every message. */
      const kept = lane === "events" ? commands : undefined;
      if (!fits(kept?.waiting.length ?? 0, kept?.bytes ?? 0, message.bytes)) {
        return { expired, full: 1 };
      }
      let full = 0;
      while (!fits(count(), held(), message.bytes)) {
        shift(events.waiting.length > 0 ? events : commands);
        full++;
      }
      lanes[lane].waiting.push(message);
      lanes[lane].bytes += message.bytes;
      return { expired, full };
    },
    take(now) {
      const expired = expire(now);
      return { message: shift(commands.waiting.length > 0 ? commands : events), expired };
    },
    clear() {
      const cleared = count();
      for (const lane of [commands, events]) {
        lane.waiting.length = 0;
        lane.bytes = 0;
      }
      return cleared;
    },
    get messages() {
      return count();
    },
    get bytes() {
      return held();
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
 * @example
 * ```ts
 * const limits = outboundLimits(config.queue);
 * ```
 */
export function outboundLimits(asked: Partial<OutboundLimits> | undefined): OutboundLimits {
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
