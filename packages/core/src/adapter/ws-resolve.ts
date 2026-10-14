import type { TopicKeyReader } from "../define/options";
import { unqualifyTopic } from "../realtime/ws/topic-key";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import { parseWSTopic } from "../realtime/ws-address";
import { resolveEndpoint } from "../utils/execute-resolve";
import type { SchemaMetadata } from "../validation";
import { isExposedToWire } from "./exposure";
import { warnNotExposed } from "./not-exposed";
import type { WSSocketContext } from "./ws-context";
import { sendSubscriptionEnd } from "./ws-subscription-end";

/**
 * Parse "source.group.method" or "source.group.method#key" topic format —
 * the group a path at any depth, `source.billing.invoices.watch` — or
 * "source.method" for an endpoint the source holds itself.
 */
export function parseTopic(topic: string): {
  source?: string | undefined;
  group?: string | undefined;
  method: string;
} {
  const { baseTopic } = unqualifyTopic(topic);
  const named = parseWSTopic(baseTopic);
  if (!named) return { method: baseTopic };
  return { source: named.source, group: named.group || undefined, method: named.method };
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
      group?: string | undefined;
      method: string;
      endpoint: unknown;
      schema: SchemaMetadata;
      topicKey?: TopicKeyReader | undefined;
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

  const dataSource = Object.hasOwn(ctx.sources, source) ? ctx.sources[source] : undefined;
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
  if (typeof endpoint !== "function" || schema?.transport !== "ws") {
    sendSubscriptionEnd(ctx, topic, msg.id, REJECTED);
    return undefined;
  }
  /* Ended as a channel that is not there is, for the same reason as a call's refusal. */
  if (!isExposedToWire(dataSource, group, schema)) {
    warnNotExposed(`[${source}][${group ?? ""}][${method}]`);
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
