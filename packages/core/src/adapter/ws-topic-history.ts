/** How much of each topic's events a handler keeps to resume subscriptions from. */
export interface TopicHistoryOptions {
  /** Events a topic keeps at most (default 100) */
  maxEvents?: number | undefined;
  /** How long an event is kept, and a topic no subscriber holds is held, in ms (default 60 000) */
  maxAgeMs?: number | undefined;
  /** Bytes of frames kept in all, every topic's together (default 8 MiB) */
  maxBytes?: number | undefined;
  /** Topics held without a subscriber at most (default 10 000) */
  maxTopics?: number | undefined;
}

export type TopicHistoryLimits = Required<{ [K in keyof TopicHistoryOptions]: number }>;

/** The limits a history keeps when its options name none. */
export const TOPIC_HISTORY_DEFAULTS: TopicHistoryLimits = {
  maxEvents: 100,
  maxAgeMs: 60_000,
  maxBytes: 8 * 1024 * 1024,
  maxTopics: 10_000,
};

/* An event kept, linked into every topic's events in the order kept: the head is the oldest of all. */
interface Kept {
  readonly topic: string;
  readonly seq: number;
  readonly frame: string;
  readonly at: number;
  older?: Kept | undefined;
  newer?: Kept | undefined;
}

/** The recent events of the topics of one replica, to send a subscription back what it missed. */
export interface TopicHistory {
  readonly limits: TopicHistoryLimits;
  /** Keep an event of a topic, its frame as it was sent */
  record(topic: string, seq: number, frame: string): void;
  /** The frames of every event after `seq` up to `upTo`, or undefined when one of them is no longer kept */
  between(topic: string, seq: number, upTo: number): readonly string[] | undefined;
  /** Forget what a topic kept */
  drop(topic: string): void;
}

/**
 * Recent events of each topic, bounded by count a topic, by age, and by
 * bytes in all: the oldest event of any topic is the first let go. What a
 * subscription missed is sent back only when every event of it is kept —
 * a gap is never passed off as the whole. Keeping, letting go and finding
 * where to start are each done in constant time.
 *
 * @param options - The limits, each defaulting to `TOPIC_HISTORY_DEFAULTS`
 * @param now - The clock; `Date.now` unless a test gives its own
 * @returns The history, empty
 * @example
 * ```ts
 * const history = createTopicHistory({ maxEvents: 50 });
 * history.record(topic, 1, frame);
 * history.between(topic, 0, 1); // [frame]
 * ```
 */
export function createTopicHistory(
  options: TopicHistoryOptions,
  now: () => number = Date.now,
): TopicHistory {
  const limits: TopicHistoryLimits = {
    maxEvents: options.maxEvents ?? TOPIC_HISTORY_DEFAULTS.maxEvents,
    maxAgeMs: options.maxAgeMs ?? TOPIC_HISTORY_DEFAULTS.maxAgeMs,
    maxBytes: options.maxBytes ?? TOPIC_HISTORY_DEFAULTS.maxBytes,
    maxTopics: options.maxTopics ?? TOPIC_HISTORY_DEFAULTS.maxTopics,
  };
  /* Each topic's events, oldest first, their numbers dense. */
  const byTopic = new Map<string, Kept[]>();
  let oldest: Kept | undefined;
  let newest: Kept | undefined;
  let bytes = 0;

  function unlink(event: Kept): void {
    if (event.older) event.older.newer = event.newer;
    else oldest = event.newer;
    if (event.newer) event.newer.older = event.older;
    else newest = event.older;
    event.older = undefined;
    event.newer = undefined;
    bytes -= event.frame.length;
  }

  /* A topic's oldest event goes first, from the topic as from the whole. */
  function letGo(event: Kept): void {
    unlink(event);
    const events = byTopic.get(event.topic);
    events?.shift();
    if (events?.length === 0) byTopic.delete(event.topic);
  }

  function expire(): void {
    const oldestKept = now() - limits.maxAgeMs;
    while (oldest && (oldest.at <= oldestKept || bytes > limits.maxBytes)) letGo(oldest);
  }

  return {
    limits,
    record(topic, seq, frame) {
      const event: Kept = { topic, seq, frame, at: now(), older: newest };
      if (newest) newest.newer = event;
      else oldest = event;
      newest = event;
      bytes += frame.length;
      const events = byTopic.get(topic) ?? [];
      byTopic.set(topic, events);
      events.push(event);
      const first = events[0];
      if (events.length > limits.maxEvents && first) letGo(first);
      expire();
    },
    between(topic, seq, upTo) {
      expire();
      if (upTo === seq) return [];
      const events = byTopic.get(topic) ?? [];
      const start = seq + 1 - (events[0]?.seq ?? Number.POSITIVE_INFINITY);
      if (start < 0 || events.at(-1)?.seq !== upTo) return undefined;
      return events.slice(start).map((event) => event.frame);
    },
    drop(topic) {
      for (const event of byTopic.get(topic) ?? []) unlink(event);
      byTopic.delete(topic);
    },
  };
}
