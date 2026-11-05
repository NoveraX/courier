import type { TopicHistoryLimits } from "./ws-topic-history";

/** The topics a handler holds once their last subscriber left, so a subscriber can come back for what it missed. */
export interface TopicRetention {
  /** The last subscriber of a topic left: hold it for `maxAgeMs`, when the handler keeps history */
  hold(topic: string): boolean;
  /** A subscriber came back to a topic: whether it was held, and is no longer */
  reclaim(topic: string): boolean;
  /** Hold nothing more */
  destroy(): void;
}

/**
 * Hold a topic its last subscriber left for as long as its events are
 * kept: its sequence, its history and, with a pub/sub adapter, its channel
 * stay, so the events published meanwhile are numbered and kept, and a
 * subscriber coming back — a client that lost its connection — is sent
 * them. Once `maxAgeMs` has passed without a subscriber, or the handler
 * holds `maxTopics` already, the topic is let go. Without history nothing
 * is held.
 *
 * @param limits - The history's limits, or undefined for a handler that keeps none
 * @param letGo - Let a topic go: its channel, its sequence, its history
 * @returns The retention
 * @example
 * ```ts
 * const retention = createTopicRetention(history?.limits, letGo);
 * if (!retention.hold(topic)) letGo(topic);
 * ```
 */
export function createTopicRetention(
  limits: TopicHistoryLimits | undefined,
  letGo: (topic: string) => void,
): TopicRetention {
  const held = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    hold(topic) {
      if (!limits) return false;
      /* The topic held longest is let go first, so holding stays bounded. */
      for (const [first, timer] of held) {
        if (held.size < limits.maxTopics) break;
        clearTimeout(timer);
        held.delete(first);
        letGo(first);
      }
      const timer = setTimeout(() => {
        held.delete(topic);
        letGo(topic);
      }, limits.maxAgeMs);
      (timer as { unref?: () => void }).unref?.();
      held.set(topic, timer);
      return true;
    },
    reclaim(topic) {
      const timer = held.get(topic);
      if (timer === undefined) return false;
      clearTimeout(timer);
      held.delete(topic);
      return true;
    },
    destroy() {
      for (const timer of held.values()) clearTimeout(timer);
      held.clear();
    },
  };
}
