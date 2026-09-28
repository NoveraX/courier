import type { TopicKeyReader } from "../define/options";
import { unqualifyTopic } from "../realtime/ws/topic-key";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import { resolveEndpoint } from "../utils/execute-resolve";
import type { SchemaMetadata } from "../validation";
import { isExposedToWire } from "./exposure";
import type { WSSocketContext } from "./ws-context";
import { sendSubscriptionEnd } from "./ws-subscription-end";

/** Parse "source.group.method" or "source.group.method#key" topic format */
export function parseTopic(topic: string): { source?: string; group?: string; method: string } {
  const { baseTopic } = unqualifyTopic(topic);
  const [first, second, third] = baseTopic.split(".");
  if (third !== undefined) return { source: first, group: second, method: third };
  if (second !== undefined) return { source: first, group: undefined, method: second };
  return { method: first ?? baseTopic };
}

const REJECTED = { code: 4403, message: "Subscription rejected" };

/** Resolve topic → source + endpoint, ending the subscription on failure */
export function resolveSubscribeTopic(
  ctx: WSSocketContext,
  msg: WSMessage,
  topic: string,
):
  | {
      source: string;
      group?: string;
      method: string;
      endpoint: unknown;
      schema: SchemaMetadata;
      topicKey?: TopicKeyReader;
      /** The source it belongs to */
      api: object;
      /** Served by this process; otherwise another server serves it, and this one relays it */
      served: boolean;
    }
  | undefined {
  const { source, group, method } = parseTopic(topic);
  if (!source) {
    sendSubscriptionEnd(ctx, topic, msg.id, {
      code: 4400,
      message: "Topic must include source name",
    });
    return undefined;
  }

  const dataSource = ctx.sources[source];
  if (!dataSource) {
    sendSubscriptionEnd(ctx, topic, msg.id, REJECTED);
    return undefined;
  }

  const { endpoint, schema, served, options } = resolveEndpoint(
    dataSource as Record<string, unknown>,
    group,
    method,
  );
  /* A channel another server serves is relayed rather than run here. */
  if (
    typeof endpoint !== "function" ||
    schema?.transport !== "ws" ||
    !isExposedToWire(dataSource, group, method)
  ) {
    sendSubscriptionEnd(ctx, topic, msg.id, REJECTED);
    return undefined;
  }

  const topicKey = options?.topicKey;
  return {
    source,
    group,
    method,
    endpoint,
    schema,
    topicKey,
    api: dataSource,
    served: served === true,
  };
}
