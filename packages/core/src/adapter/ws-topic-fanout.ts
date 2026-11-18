import { encodeMessage } from "../realtime/ws/ws-protocol";
import type { RegistryEntry } from "./ws-registry-types";
import type { TopicPosition } from "./ws-topic-sequences";

/** The connections a broadcast sends to before it lets the event loop run: thousands do not hold it. */
export const BATCH_SIZE = 512;

/** Let the event loop run between two batches of a broadcast. */
export const yieldTick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** An event on its way to the subscribers its topic had when the event was numbered. */
interface Delivery {
  readonly position: TopicPosition;
  readonly encoded: string;
  /** The connection sent `skip` with the event's number in its turn */
  readonly exclude: string | undefined;
  /** Whom it goes to, each cleared once sent it, or owed it no more */
  readonly ids: (string | undefined)[];
  /** The first of them it has not come to */
  next: number;
  readonly sent: () => void;
  readonly failed: (error: unknown) => void;
}

/**
 * What sends a topic's events to its subscribers: each to the subscribers
 * the topic had when it was numbered, a batch at a time, and a topic's
 * events one after another in the order of their numbers — whoever joined
 * or left between two of them, each subscriber has them in that order.
 */
export interface TopicFanout {
  /**
   * Send an event to `subscribers`, once the topic's events before it were
   * sent; `exclude`, one of them, is sent `skip` with its number instead.
   * @returns Resolves once each was sent it, rejects with what sending threw
   */
  deliver(
    topic: string,
    subscribers: Iterable<string>,
    position: TopicPosition,
    encoded: string,
    exclude: string | undefined,
  ): Promise<void>;
  /**
   * Send a connection now, in their order, what the topic's events on their
   * way still owe it — but those `resumedTo` counts: what resuming its
   * subscription sent it, or what is before the position it started from.
   */
  sendOwed(topic: string, connectionId: string, resumedTo?: TopicPosition): void;
}

/**
 * Create the fan-out of a registry's topics.
 *
 * @param entries - The registry's connections
 * @returns The fan-out
 * @example
 * ```ts
 * const fanout = createTopicFanout(entries);
 * await fanout.deliver(topic, subscribers, { seq: 42, epoch: "k2m9x" }, frame, senderId);
 * ```
 */
export function createTopicFanout(entries: ReadonlyMap<string, RegistryEntry>): TopicFanout {
  /* Each topic's events on their way, in the order of their numbers: the first is being sent. */
  const queues = new Map<string, Delivery[]>();

  function send(topic: string, delivery: Delivery, id: string): void {
    const { position } = delivery;
    const frame =
      id === delivery.exclude
        ? encodeMessage({ type: "skip", topic, seq: position.seq })
        : delivery.encoded;
    entries.get(id)?.sendTopicEvent(topic, position, frame);
  }

  async function run(topic: string, queue: Delivery[]): Promise<void> {
    let count = 0;
    for (let delivery = queue[0]; delivery !== undefined; delivery = queue[0]) {
      try {
        while (delivery.next < delivery.ids.length) {
          const id = delivery.ids[delivery.next++];
          if (id !== undefined) send(topic, delivery, id);
          if (++count % BATCH_SIZE === 0) await yieldTick();
        }
        delivery.sent();
      } catch (error) {
        delivery.failed(error);
      }
      queue.shift();
    }
    queues.delete(topic);
  }

  return {
    deliver(topic, subscribers, position, encoded, exclude) {
      return new Promise<void>((sent, failed) => {
        const ids = [...subscribers];
        const delivery: Delivery = { position, encoded, exclude, ids, next: 0, sent, failed };
        const waiting = queues.get(topic);
        if (waiting !== undefined) {
          waiting.push(delivery);
          return;
        }
        const queue = [delivery];
        queues.set(topic, queue);
        void run(topic, queue);
      });
    },
    sendOwed(topic, connectionId, resumedTo) {
      for (const delivery of queues.get(topic) ?? []) {
        const at = delivery.ids.indexOf(connectionId, delivery.next);
        if (at === -1) continue;
        delivery.ids[at] = undefined;
        if (!counts(resumedTo, delivery.position)) send(topic, delivery, connectionId);
      }
    },
  };
}

/* Whether a position counts an event: one of its sequence, at or before it. */
function counts(position: TopicPosition | undefined, event: TopicPosition): boolean {
  return position?.epoch === event.epoch && event.seq <= position.seq;
}
