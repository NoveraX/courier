import { randomId } from "../utils/random-id";

/** Where a topic's sequence stands: the last number given, in the epoch that names the sequence. */
export interface TopicPosition {
  /** The last number given, 0 before the first event */
  readonly seq: number;
  /** Names the sequence: another epoch is another count, whose positions say nothing of this one's */
  readonly epoch: string;
}

/** The numbers of each topic's events on this replica. */
export interface TopicSequences {
  /** The number the topic's next event takes */
  next(topic: string): TopicPosition;
  /** Where the topic's sequence stands now */
  position(topic: string): TopicPosition;
  /** Forget a topic no subscriber holds any more: its next event starts a new epoch */
  forget(topic: string): void;
  /** Whether a topic's sequence is held: a subscriber holds the topic, or the handler holds it for one */
  has(topic: string): boolean;
  /** The topics whose sequences are held */
  topics(): IterableIterator<string>;
  /**
   * Follow an event a log numbered: `next` when it is the one after the
   * last, `duplicate` for one already counted, `gap` when some came
   * between, `epoch` when the log began another sequence
   */
  adopt(topic: string, seq: number, epoch: string): "next" | "duplicate" | "gap" | "epoch";
  /**
   * Follow a log's sequence of a topic from where it stands, unless this
   * replica counts the topic already: its subscribers were told where its
   * count stands, and the events that follow correct it
   */
  follow(topic: string, position: TopicPosition): void;
}

/**
 * The sequences of the topics this replica delivers to: each event of a
 * topic, published here or by another replica, takes the next number of
 * the topic's sequence, dense from 1 and the same for every subscriber, so
 * it is encoded once for all of them. A sequence lives while a subscriber
 * holds its topic; one begun anew has an epoch of its own.
 *
 * @returns The sequences, none yet
 * @example
 * ```ts
 * const sequences = createTopicSequences();
 * sequences.next(topic); // { seq: 1, epoch: "…" }
 * ```
 */
export function createTopicSequences(): TopicSequences {
  const positions = new Map<string, { seq: number; epoch: string }>();

  function of(topic: string): { seq: number; epoch: string } {
    let position = positions.get(topic);
    if (!position) {
      position = { seq: 0, epoch: randomId().slice(0, 8) };
      positions.set(topic, position);
    }
    return position;
  }

  return {
    next(topic) {
      const position = of(topic);
      position.seq++;
      return { seq: position.seq, epoch: position.epoch };
    },
    position(topic) {
      const { seq, epoch } = of(topic);
      return { seq, epoch };
    },
    forget(topic) {
      positions.delete(topic);
    },
    has: (topic) => positions.has(topic),
    topics: () => positions.keys(),
    adopt(topic, seq, epoch) {
      const known = positions.get(topic);
      if (!known) {
        positions.set(topic, { seq, epoch });
        return "next";
      }
      if (known.epoch !== epoch) {
        known.epoch = epoch;
        known.seq = seq;
        return "epoch";
      }
      if (seq <= known.seq) return "duplicate";
      const skipped = seq > known.seq + 1;
      known.seq = seq;
      return skipped ? "gap" : "next";
    },
    follow(topic, { seq, epoch }) {
      if (!positions.has(topic)) positions.set(topic, { seq, epoch });
    },
  };
}
