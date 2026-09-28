import type { TopicKeyReader } from "../../define/options";
import { qualifyTopic } from "./topic-key";

/**
 * The topic a served subscription is known by: its endpoint's base topic,
 * qualified by the channel's `.topic()` key of the validated variables, or
 * by all of them when the channel names no key.
 *
 * @param baseTopic - The endpoint's topic, e.g. `"api.chat.room"`
 * @param variables - The subscriber's variables, as the schema produced them
 * @param topicKey - Reads the key subscribers share a topic by, when the channel has one
 * @returns The qualified topic
 *
 * @example
 * servedTopic("api.chat.room", { room: "a", nick: "ann" }, (v) => ({ room: v.room }));
 * // 'api.chat.room#{"room":"a"}'
 */
export function servedTopic(
  baseTopic: string,
  variables: unknown,
  topicKey?: TopicKeyReader,
): string {
  return qualifyTopic(baseTopic, topicKey ? topicKey(variables) : variables);
}
