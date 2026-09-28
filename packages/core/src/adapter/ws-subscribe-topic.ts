import type { TopicKeyReader } from "../define/options";
import { createLogger } from "../logger";
import { describeFailure } from "../realtime/describe-failure";
import { servedTopic } from "../realtime/ws/served-topic";
import { unqualifyTopic } from "../realtime/ws/topic-key";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import type { WSSocketContext } from "./ws-context";
import { sendSubscriptionEnd } from "./ws-subscription-end";

const log = createLogger("WS");

/**
 * The topic the server subscribes a connection under: the endpoint of the
 * topic the client asked for, qualified from the validated variables and
 * the channel's topic key. A key that throws ends the subscription.
 *
 * @param ctx - Per-connection socket context
 * @param msg - The client's subscribe message
 * @param topic - The topic the client asked for
 * @param variables - The variables as the schema produced them
 * @param topicKey - Reads the key subscribers share a topic by, when the channel has one
 * @returns The topic, or nothing when the subscription was ended
 *
 * @example
 * const subscribed = subscriptionTopic(ctx, msg, msg.topic, variables, resolved.topicKey);
 * if (subscribed === undefined) return;
 */
export function subscriptionTopic(
  ctx: WSSocketContext,
  msg: WSMessage,
  topic: string,
  variables: unknown,
  topicKey: TopicKeyReader | undefined,
): string | undefined {
  try {
    return servedTopic(unqualifyTopic(topic).baseTopic, variables, topicKey);
  } catch (error) {
    log.warn("Channel topic key failed", error);
    sendSubscriptionEnd(ctx, topic, msg.id, describeFailure(error, "Subscription failed"));
    return undefined;
  }
}
