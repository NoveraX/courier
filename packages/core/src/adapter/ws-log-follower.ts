import type { RefusalLog } from "../logger/refusal-log";
import type { LoggedPosition, TopicLog } from "../realtime/adapters";
import { encodeMessage } from "../realtime/ws/ws-protocol";
import { LIMITS } from "./limits";
import { askLog, wholeRange } from "./ws-log-reads";
import { type BroadcastTargets, deliverToTopic } from "./ws-registry-broadcast";
import type { TopicPosition } from "./ws-topic-sequences";

/** How many topics a replica back from an outage catches up from the log at once. */
const CATCH_UP_AT_ONCE = 16;

/** An event of a topic that came while the ones before it were read from the log. */
interface Waiting {
  readonly payload: unknown;
  readonly logged: LoggedPosition;
}

/** How a replica follows the log's sequence of each topic it delivers. */
export interface LogFollower {
  /** Deliver an event the log numbered, as the pub/sub adapter brought it */
  deliver(topic: string, payload: unknown, logged: LoggedPosition): void;
  /** Catch every topic this replica counts up with the log: the adapter is back from an outage */
  catchUp(): Promise<void>;
}

/**
 * Follow the log's sequence of each topic this replica delivers: an event
 * reaches the topic's subscribers in the order of its number, once; one
 * that comes after events this replica never got waits while those are
 * read from the log and sent first; and where the log no longer keeps
 * them, does not answer in time, or began another sequence, the
 * subscribers are told `resync` before it.
 *
 * @param targets - The connections, their subscriptions and the topics' sequences
 * @param log - The adapter's log
 * @param refusals - The handler's log of refusals, for a log that did not answer
 * @returns The follower
 * @example
 * ```ts
 * const follower = createLogFollower(targets, pubsub.log, refusals);
 * follower.deliver(topic, { text: "hi" }, { seq: 42, epoch: "k2m9x" });
 * ```
 */
export function createLogFollower(
  targets: BroadcastTargets,
  log: TopicLog,
  refusals: RefusalLog,
): LogFollower {
  const { sequences } = targets;
  /* The topics whose missed events are being read, each with what came meanwhile. */
  const filling = new Map<string, Waiting[]>();

  function resync(topic: string, position: TopicPosition): void {
    const frame = encodeMessage({ type: "resync", topic, ...position });
    for (const id of targets.topicManager?.subscribers(topic) ?? [])
      targets.entries.get(id)?.sendTopicEvent(topic, position, frame);
  }

  function accept(topic: string, payload: unknown, logged: LoggedPosition): void {
    const { seq, epoch, exclude } = logged;
    const verdict = sequences.adopt(topic, seq, epoch);
    if (verdict === "duplicate") return;
    if (verdict !== "next") resync(topic, { seq: seq - 1, epoch });
    const encoded = encodeMessage({ type: "data", topic, payload, seq });
    void deliverToTopic(targets, topic, { seq, epoch }, encoded, exclude);
  }

  async function fill(topic: string, from: TopicPosition, upTo: number): Promise<void> {
    const events = await askLog(log.read(topic, from, upTo), refusals);
    const waiting = filling.get(topic) ?? [];
    filling.delete(topic);
    if (!sequences.has(topic)) return;
    if (events && wholeRange(events, from, upTo)) {
      for (const event of events) accept(topic, event.payload, event);
    } else {
      sequences.adopt(topic, upTo, from.epoch);
      resync(topic, { seq: upTo, epoch: from.epoch });
    }
    for (const { payload, logged } of waiting) deliver(topic, payload, logged);
  }

  function deliver(topic: string, payload: unknown, logged: LoggedPosition): void {
    const waiting = filling.get(topic);
    if (waiting) {
      if (waiting.length < LIMITS.WS_LOG_WAITING_EVENTS) waiting.push({ payload, logged });
      return;
    }
    if (!sequences.has(topic)) {
      /* Not counted here, and no subscriber: what is left in flight of a topic let go. */
      if (targets.topicManager?.subscribers(topic)?.size) accept(topic, payload, logged);
      return;
    }
    const known = sequences.position(topic);
    if (known.epoch !== logged.epoch || logged.seq <= known.seq + 1) {
      accept(topic, payload, logged);
      return;
    }
    filling.set(topic, [{ payload, logged }]);
    void fill(topic, known, logged.seq - 1);
  }

  async function catchUpTopic(topic: string): Promise<void> {
    const position = await askLog(log.position(topic), refusals);
    if (filling.has(topic) || !sequences.has(topic)) return;
    const known = sequences.position(topic);
    if (!position || position.epoch !== known.epoch) {
      if (position) sequences.adopt(topic, position.seq, position.epoch);
      resync(topic, position ?? known);
    } else if (position.seq > known.seq) {
      filling.set(topic, []);
      await fill(topic, known, position.seq);
    }
  }

  return {
    deliver,
    async catchUp() {
      const topics = [...sequences.topics()];
      for (let i = 0; i < topics.length; i += CATCH_UP_AT_ONCE) {
        await Promise.all(topics.slice(i, i + CATCH_UP_AT_ONCE).map(catchUpTopic));
      }
    },
  };
}
