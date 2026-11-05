import { encodeMessage } from "../realtime/ws/ws-protocol";
import type { RegistryEntry } from "./ws-registry-types";
import type { TopicHistory } from "./ws-topic-history";
import type { TopicPosition, TopicSequences } from "./ws-topic-sequences";
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
  /** The events kept to resume subscriptions from, when the handler keeps history */
  readonly history: TopicHistory | undefined;
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
  /* A topic held for a subscriber that left has its events numbered and kept all the same. */
  if (!subscriberIds?.size && !targets.sequences.has(topic)) return;
  const position = targets.sequences.next(topic);
  const encoded = encodeMessage({ type: "data", topic, payload: data, seq: position.seq });
  targets.history?.record(topic, position.seq, encoded);
  await deliverToTopic(targets, topic, position, encoded, exclude);
}

/**
 * Send a frame of a topic's sequence — an event, numbered — to every
 * subscriber of the topic as such, which one resuming holds until what it
 * missed is sent; the one left out, when it is a subscriber, is sent
 * `skip` with the number instead, so its count stays whole.
 *
 * @param targets - The connections and their subscriptions
 * @param topic - The qualified topic
 * @param position - The event's number, and the epoch of the sequence it belongs to
 * @param encoded - The event's frame
 * @param exclude - A connection left out
 * @returns Resolves once every subscriber was sent it
 * @example
 * ```ts
 * await deliverToTopic(targets, topic, { seq: 42, epoch: "k2m9x" }, frame, senderId);
 * ```
 */
export async function deliverToTopic(
  targets: BroadcastTargets,
  topic: string,
  position: TopicPosition,
  encoded: string,
  exclude: string | undefined,
): Promise<void> {
  const subscriberIds = targets.topicManager?.subscribers(topic);
  if (!subscriberIds?.size) return;
  if (exclude !== undefined && subscriberIds.has(exclude)) {
    const skip = encodeMessage({ type: "skip", topic, seq: position.seq });
    targets.entries.get(exclude)?.sendTopicEvent(topic, position, skip);
  }
  const batch: Batch = { sent: 0 };
  for (const id of [...subscriberIds]) {
    if (id !== exclude) targets.entries.get(id)?.sendTopicEvent(topic, position, encoded);
    if (++batch.sent % BATCH_SIZE === 0) await yieldTick();
  }
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

/**
 * Tell every subscription of every topic this replica counts that its
 * sequence may have missed events — the pub/sub adapter was away, and no
 * log keeps what it missed — letting go of the history kept of each, so
 * nothing from before is resumed.
 *
 * @param targets - The connections, their subscriptions and the topics' sequences
 * @example
 * ```ts
 * resyncEvery(targets);
 * ```
 */
export function resyncEvery(targets: BroadcastTargets): void {
  for (const topic of [...targets.sequences.topics()]) {
    targets.history?.drop(topic);
    const position = targets.sequences.position(topic);
    const frame = encodeMessage({ type: "resync", topic, ...position });
    for (const id of targets.topicManager?.subscribers(topic) ?? [])
      targets.entries.get(id)?.sendTopicEvent(topic, position, frame);
  }
}
