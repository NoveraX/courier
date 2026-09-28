import { ConfigurationError } from "../errors/configuration-error";
import type { BuilderState } from "./builder";
import type { TopicKeyReader } from "./options";

/**
 * Record what a channel's subscribers share a topic by.
 *
 * @param state - The channel's builder state
 * @param key - Reads the topic key from a subscriber's validated variables
 * @returns The state, keyed
 * @throws ConfigurationError `SLOT_ALREADY_SET` when the channel was keyed already
 *
 * @example
 * const keyed = withTopicKey(state, (v) => ({ room: (v as { room: string }).room }));
 */
export function withTopicKey(state: BuilderState, key: TopicKeyReader): BuilderState {
  if (state.topicKey !== undefined) {
    throw new ConfigurationError(
      "SLOT_ALREADY_SET",
      "[courier] .topic() was called twice on the same channel — it may be set once",
    );
  }
  return { ...state, topicKey: key };
}

/**
 * Refuse a topic key on a channel another process serves. That server decides
 * the channel's topics, so the key would be kept and never read.
 *
 * @param state - The channel's builder state
 * @param terminal - The method that addressed it, for the message
 * @throws ConfigurationError `TOPIC_ON_REMOTE_CHANNEL` when the channel was keyed
 *
 * @example
 * assertServedTopicKey(state, "connect");
 */
export function assertServedTopicKey(state: BuilderState, terminal: string): void {
  if (state.topicKey === undefined) return;
  throw new ConfigurationError(
    "TOPIC_ON_REMOTE_CHANNEL",
    `[courier] .topic() keys a channel this process serves, but this one was addressed with ` +
      `.${terminal}() — the server that serves it decides its topics. Remove .topic(), or ` +
      "serve the channel here with .implement()",
  );
}
