import { randomId } from "../utils/random-id";
import type { LoggedEvent, PubSubEnvelope, TopicLog } from "./adapters";

/** How much a memory log keeps. */
export interface MemoryTopicLogOptions {
  /** Events kept a topic at most (default 1000) */
  maxEvents?: number | undefined;
  /**
   * Topics kept at most: the one published to longest ago is let go first,
   * and begins anew in another epoch (default 10 000)
   */
  maxTopics?: number | undefined;
}

type Listener = (envelope: PubSubEnvelope) => void;

/** A topic's sequence, and the events of it kept, oldest first. */
interface LoggedTopic {
  seq: number;
  readonly epoch: string;
  readonly events: LoggedEvent[];
}

/**
 * The log every replica of one memory bus shares: one sequence a topic,
 * its events kept up to `maxEvents`, and each event delivered to every
 * replica subscribed to the topic, its sender too, as Redis delivers what
 * its log numbers.
 *
 * @param channels - The bus's listeners, by channel
 * @param options - How much it keeps
 * @returns The log a replica of the bus is given, by its origin
 * @example
 * ```ts
 * const logFor = createMemoryTopicLogs(channels, { maxEvents: 100 });
 * const log = logFor("replica-a");
 * ```
 */
export function createMemoryTopicLogs(
  channels: ReadonlyMap<string, ReadonlySet<Listener>>,
  options: MemoryTopicLogOptions,
): (origin: string) => TopicLog {
  const maxEvents = options.maxEvents ?? 1_000;
  const maxTopics = options.maxTopics ?? 10_000;
  const topics = new Map<string, LoggedTopic>();

  function of(topic: string): LoggedTopic {
    let logged = topics.get(topic);
    if (!logged) {
      const oldest = topics.keys().next();
      if (topics.size >= maxTopics && !oldest.done) topics.delete(oldest.value);
      logged = { seq: 0, epoch: randomId().slice(0, 8), events: [] };
      topics.set(topic, logged);
    }
    return logged;
  }

  return (origin) => ({
    async append(topic, payload, exclude) {
      const logged = of(topic);
      topics.delete(topic);
      topics.set(topic, logged);
      const event: LoggedEvent = { seq: ++logged.seq, epoch: logged.epoch, payload, exclude };
      logged.events.push(event);
      if (logged.events.length > maxEvents) logged.events.shift();
      const { seq, epoch } = event;
      const envelope: PubSubEnvelope = {
        origin,
        payload,
        timestamp: Date.now(),
        logged: { seq, epoch, exclude },
      };
      queueMicrotask(() => {
        for (const listener of [...(channels.get(topic) ?? [])]) listener(envelope);
      });
    },
    async position(topic) {
      const { seq, epoch } = of(topic);
      return { seq, epoch };
    },
    async read(topic, from, upTo) {
      const logged = topics.get(topic);
      if (!logged || logged.epoch !== from.epoch) return undefined;
      if (upTo < from.seq || upTo > logged.seq) return undefined;
      const first = logged.events[0]?.seq ?? logged.seq + 1;
      if (upTo > from.seq && from.seq + 1 < first) return undefined;
      return logged.events.slice(Math.max(0, from.seq + 1 - first), Math.max(0, upTo + 1 - first));
    },
  });
}
