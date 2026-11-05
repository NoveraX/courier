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
  };
}
