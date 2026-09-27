import { createLogger } from "../logger";
import type { PubSubAdapter } from "../realtime/adapters";

const log = createLogger("WS");

/** A channel this replica listens to, and how many local users need it. */
interface TrackedChannel {
  refCount: number;
  unsubscribe: () => void;
}

/** Reference-counted pub/sub subscriptions, one per channel. */
export interface PubSubChannels {
  /**
   * Take a reference on a channel. The first subscribes to it, delivering
   * what other replicas publish there to `deliver`.
   */
  retain(channel: string, deliver: (message: unknown) => void): Promise<void>;
  /** Drop a reference on a channel. The last unsubscribes from it. */
  release(channel: string): Promise<void>;
  /** Unsubscribe from every channel, once in-flight subscribes have settled. */
  destroy(): Promise<void>;
}

/**
 * Create the reference-counted subscriptions a replica holds on its pub/sub
 * adapter. Concurrent first references share one `subscribe`, and a release
 * waits for a subscribe still in flight.
 *
 * @param pubsub - The adapter shared by every replica
 * @returns The channel tracker
 *
 * @example
 * const channels = createPubSubChannels(pubsub);
 * await channels.retain("api.chat.room#1a2b3c4d", (message) => deliver(message));
 * await channels.release("api.chat.room#1a2b3c4d");
 */
export function createPubSubChannels(pubsub: PubSubAdapter): PubSubChannels {
  const channels = new Map<string, TrackedChannel>();
  /** Subscribes in flight — a second first reference waits for the one under way */
  const pending = new Map<string, Promise<void>>();
  let destroyed = false;

  async function subscribe(channel: string, deliver: (message: unknown) => void): Promise<void> {
    try {
      const unsubscribe = await pubsub.subscribe(channel, (message) => {
        if (!destroyed) deliver(message);
      });
      if (destroyed) {
        unsubscribe();
        return;
      }
      channels.set(channel, { refCount: 1, unsubscribe });
    } catch (err) {
      log.warn(`Failed to subscribe pubsub topic: ${channel}`, err);
    } finally {
      pending.delete(channel);
    }
  }

  async function retain(channel: string, deliver: (message: unknown) => void): Promise<void> {
    if (destroyed) return;
    const inflight = pending.get(channel);
    if (inflight) await inflight;
    const existing = channels.get(channel);
    if (existing) {
      existing.refCount++;
      return;
    }
    const subscribing = subscribe(channel, deliver);
    pending.set(channel, subscribing);
    await subscribing;
  }

  async function release(channel: string): Promise<void> {
    const inflight = pending.get(channel);
    if (inflight) await inflight;
    const tracked = channels.get(channel);
    if (!tracked) return;
    tracked.refCount--;
    if (tracked.refCount > 0) return;
    channels.delete(channel);
    try {
      tracked.unsubscribe();
    } catch (err) {
      log.warn(`Failed to unsubscribe pubsub topic: ${channel}`, err);
    }
  }

  async function destroy(): Promise<void> {
    destroyed = true;
    if (pending.size > 0) await Promise.allSettled([...pending.values()]);
    for (const [channel, tracked] of channels) {
      try {
        tracked.unsubscribe();
      } catch (err) {
        log.warn(`PubSub unsubscribe failed during shutdown: ${channel}`, err);
      }
    }
    channels.clear();
  }

  return { retain, release, destroy };
}
