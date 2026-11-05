import { createLogger } from "../logger";
import type { LoggedPosition, PubSubAdapter } from "../realtime/adapters";

const log = createLogger("WS");

/** A channel this replica listens to, and how many local users need it. */
interface TrackedChannel {
  refCount: number;
  /** Set once the adapter has taken the subscription */
  unsubscribe: (() => void) | undefined;
}

/** Reference-counted pub/sub subscriptions, one per channel. */
export interface PubSubChannels {
  /**
   * Take a reference on a channel. The first subscribes to it, delivering
   * what other replicas publish there to `deliver`.
   */
  retain(channel: string, deliver: (message: unknown, logged?: LoggedPosition) => void): void;
  /** Drop a reference on a channel. The last unsubscribes from it. */
  release(channel: string): void;
  /** Unsubscribe from every channel, at once: nothing still under way is waited for. */
  destroy(): void;
}

/**
 * Create the reference-counted subscriptions a replica holds on its pub/sub
 * adapter. The adapter keeps each subscription it was given — made again
 * after a reconnect, retried after a refusal — so a channel is subscribed
 * once, when its first reference is taken, and never forgotten while a
 * local user needs it. Nothing waits on the adapter: a subscription it has
 * not yet taken is let go of as soon as it is.
 *
 * @param pubsub - The adapter shared by every replica
 * @returns The channel tracker
 *
 * @example
 * const channels = createPubSubChannels(pubsub);
 * channels.retain('api.chat.room#{"room":"a"}', (message) => deliver(message));
 * channels.release('api.chat.room#{"room":"a"}');
 */
export function createPubSubChannels(pubsub: PubSubAdapter): PubSubChannels {
  const channels = new Map<string, TrackedChannel>();
  let destroyed = false;

  function subscribe(
    channel: string,
    tracked: TrackedChannel,
    deliver: (m: unknown, logged?: LoggedPosition) => void,
  ): void {
    const current = (): boolean => !destroyed && channels.get(channel) === tracked;
    pubsub
      .subscribe(channel, (message, logged) => {
        if (current()) deliver(message, logged);
      })
      .then(
        (unsubscribe) => {
          if (current()) tracked.unsubscribe = unsubscribe;
          else unsubscribe();
        },
        /* The contract has an adapter keep a subscription its server refused
           and make it again; one that rejects has been stopped, or does not
           keep it. */
        (error: unknown) => log.error(`The pub/sub adapter did not take channel ${channel}`, error),
      );
  }

  /* What letting go of one channel throws ends neither the release nor the
     others' — the socket closing or the handler stopping goes on. */
  function letGo(channel: string, tracked: TrackedChannel): void {
    try {
      tracked.unsubscribe?.();
    } catch (error) {
      log.error(`The pub/sub adapter failed to let go of channel ${channel}`, error);
    }
  }

  return {
    retain(channel, deliver) {
      if (destroyed) return;
      const existing = channels.get(channel);
      if (existing) {
        existing.refCount++;
        return;
      }
      const tracked: TrackedChannel = { refCount: 1, unsubscribe: undefined };
      channels.set(channel, tracked);
      subscribe(channel, tracked, deliver);
    },
    release(channel) {
      const tracked = channels.get(channel);
      if (!tracked) return;
      tracked.refCount--;
      if (tracked.refCount > 0) return;
      channels.delete(channel);
      letGo(channel, tracked);
    },
    destroy() {
      destroyed = true;
      for (const [channel, tracked] of channels) letGo(channel, tracked);
      channels.clear();
    },
  };
}
