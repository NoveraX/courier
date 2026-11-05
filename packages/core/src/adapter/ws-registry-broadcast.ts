import { encodeMessage } from "../realtime/ws/ws-protocol";
import type { RegistryEntry } from "./ws-registry-types";
import type { TopicSequences } from "./ws-topic-sequences";
import type { ServerTopicManager } from "./ws-topics";

/**
 * Yield to the event loop between broadcast batches.
 * Prevents blocking on 1000+ subscribers.
 */
const BATCH_SIZE = 512;
const yieldTick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** What a broadcast reaches: the live connections, and who is subscribed to what. */
export interface BroadcastTargets {
  readonly entries: ReadonlyMap<string, RegistryEntry>;
  readonly topicManager: ServerTopicManager | undefined;
  /** The numbers of each topic's events */
  readonly sequences: TopicSequences;
}

/** Counts the frames a broadcast has sent, yielding after every batch. */
interface Batch {
  sent: number;
}

async function deliver(
  entries: ReadonlyMap<string, RegistryEntry>,
  ids: readonly string[],
  encoded: string,
  exclude: string | undefined,
  batch: Batch,
): Promise<void> {
  for (const id of ids) {
    if (id !== exclude) entries.get(id)?.sendEncoded(encoded);
    if (++batch.sent % BATCH_SIZE === 0) await yieldTick();
  }
}

/**
 * Send a data frame to every connection, one batch at a time: a notice,
 * which no topic's sequence numbers.
 *
 * @param targets - The connections
 * @param data - The payload
 * @param exclude - A connection left out
 * @returns Resolves once every connection was sent the frame
 *
 * @example
 * await broadcastToAll(targets, { notice: "maintenance at noon" });
 */
export async function broadcastToAll(
  targets: BroadcastTargets,
  data: unknown,
  exclude?: string,
): Promise<void> {
  const encoded = encodeMessage({ type: "data", payload: data });
  const snapshot = new Map(targets.entries);
  await deliver(snapshot, [...snapshot.keys()], encoded, exclude, { sent: 0 });
}

/**
 * Send an event of a topic to every connection subscribed to it: it takes
 * the next number of the topic's sequence, the same for every subscriber,
 * and the one left out, when it is a subscriber, is sent `skip` with it.
 *
 * @param targets - The connections, their subscriptions and the topics' sequences
 * @param topic - The qualified topic
 * @param data - The payload
 * @param exclude - A connection left out
 * @returns Resolves once every subscriber was sent the frame
 *
 * @example
 * await broadcastToTopic(targets, 'api.chat.room#{"room":"a"}', { text: "hi" });
 */
export async function broadcastToTopic(
  targets: BroadcastTargets,
  topic: string,
  data: unknown,
  exclude?: string,
): Promise<void> {
  const subscriberIds = targets.topicManager?.subscribers(topic);
  if (!subscriberIds?.size) return;
  const { seq } = targets.sequences.next(topic);
  const encoded = encodeMessage({ type: "data", topic, payload: data, seq });
  /* The one left out learns the number was taken, so its count stays whole. */
  if (exclude !== undefined && subscriberIds.has(exclude)) {
    targets.entries.get(exclude)?.sendEncoded(encodeMessage({ type: "skip", topic, seq }));
  }
  await deliver(targets.entries, [...subscriberIds], encoded, exclude, { sent: 0 });
}

/**
 * Send a data frame on every qualified topic of an endpoint, each on its
 * own topic: a notice, which no topic's sequence numbers — the sender
 * cannot know the qualified topics other replicas hold.
 *
 * @param targets - The connections and their subscriptions
 * @param baseTopic - The endpoint's topic, e.g. `"api.chat.room"`
 * @param data - The payload
 * @param exclude - A connection left out
 * @returns Resolves once every subscriber of every qualified topic was sent the frame
 *
 * @example
 * await broadcastToBaseTopic(targets, "api.chat.room", { text: "to all rooms" });
 */
export async function broadcastToBaseTopic(
  targets: BroadcastTargets,
  baseTopic: string,
  data: unknown,
  exclude?: string,
): Promise<void> {
  const qualifiedTopics = targets.topicManager?.topicsByBase(baseTopic);
  if (!qualifiedTopics?.size) return;
  const batch: Batch = { sent: 0 };
  for (const topic of [...qualifiedTopics]) {
    const subscriberIds = targets.topicManager?.subscribers(topic);
    if (!subscriberIds?.size) continue;
    const encoded = encodeMessage({ type: "data", topic, payload: data });
    await deliver(targets.entries, [...subscriberIds], encoded, exclude, batch);
  }
}
