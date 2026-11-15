/**
 * What a subscriber connection holds of its channels, as far as the
 * replies tell: those Redis confirmed on it, and those it may hold with no
 * reply on it to say so — held as a connection was lost, which ioredis
 * subscribes again on the next, or whose SUBSCRIBE was answered only after
 * a reconnect.
 */
export interface HeldChannels {
  /** Those Redis confirmed on this connection */
  readonly confirmed: ReadonlySet<string>;
  /** A SUBSCRIBE was answered: on this connection, or after a reconnect, when the channel may be held */
  subscribed(channel: string, onThisConnection: boolean): void;
  /** An UNSUBSCRIBE was answered on this connection: the channel is held no more */
  unsubscribed(channel: string): void;
  /** The connection was lost: none is confirmed, and each it held may be held on the next */
  lost(): void;
  /** Those the connection may hold that `wanted` does not name */
  strayFrom(wanted: ReadonlyMap<string, unknown>): string[];
  /** Every one the connection may hold, forgotten as they are handed over */
  takeAll(): string[];
}

/**
 * Follow what a subscriber connection holds of its channels, so the ones
 * no handler wants are let go of however late Redis answered for them.
 *
 * @returns The channels held, none yet
 * @example
 * ```ts
 * const held = createHeldChannels();
 * held.subscribed("room", true);
 * held.strayFrom(new Map()); // ["room"]
 * ```
 */
export function createHeldChannels(): HeldChannels {
  const confirmed = new Set<string>();
  const maybe = new Set<string>();
  return {
    confirmed,
    subscribed(channel, onThisConnection) {
      if (!onThisConnection) {
        if (!confirmed.has(channel)) maybe.add(channel);
        return;
      }
      confirmed.add(channel);
      maybe.delete(channel);
    },
    unsubscribed(channel) {
      confirmed.delete(channel);
      maybe.delete(channel);
    },
    lost() {
      for (const channel of confirmed) maybe.add(channel);
      confirmed.clear();
    },
    strayFrom: (wanted) => [...new Set([...confirmed, ...maybe])].filter((c) => !wanted.has(c)),
    takeAll() {
      const all = [...new Set([...confirmed, ...maybe])];
      confirmed.clear();
      maybe.clear();
      return all;
    },
  };
}
