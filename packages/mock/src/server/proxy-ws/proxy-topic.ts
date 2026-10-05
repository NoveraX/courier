import { parseWSTopic } from "@noverax/courier/internal";
import { qualifyTopic, unqualifyTopic } from "@noverax/courier/realtime";

/** The endpoint a proxy subscription's topic names. */
export interface ProxyTopic {
  source: string;
  /** The group's path, `billing.invoices`; empty for an endpoint outside any group */
  group: string;
  method: string;
  /** The topic without its key: `source.group.method` */
  base: string;
}

/**
 * Read the endpoint a topic names: `source.group.method` — the group a path
 * at any depth, `shop.billing.invoices.watch` — or `source.method` for an
 * endpoint outside any group, then `#` and the key its subscribers share.
 *
 * @param topic - The topic a client subscribes to
 * @returns The endpoint, or `undefined` when the topic names no source
 * @example
 * ```ts
 * parseProxyTopic('shop.chat.room#{"room":"r1"}');
 * // → { source: "shop", group: "chat", method: "room", base: "shop.chat.room" }
 * ```
 */
export function parseProxyTopic(topic: string): ProxyTopic | undefined {
  const { baseTopic: base } = unqualifyTopic(topic);
  const named = parseWSTopic(base);
  return named && { ...named, base };
}

/**
 * The topic a subscription is served under: its base, keyed by what a
 * `.topic()` reader takes from the checked variables, or by the variables.
 *
 * A Courier server derives the key from what it validated rather than trust
 * the one the client sent, and says so with `renamed` when the two differ.
 *
 * @param base - The topic without its key
 * @param variables - The subscription's checked variables
 * @param topicKey - The channel's `.topic()` reader, if it has one
 * @returns The topic
 * @throws Whatever the reader throws
 * @example
 * ```ts
 * servedTopic("shop.chat.room", { room: "r1", user: "ada" }, (v) => ({ room: v.room }));
 * // → 'shop.chat.room#{"room":"r1"}'
 * ```
 */
export function servedTopic(
  base: string,
  variables: unknown,
  topicKey: ((variables: unknown) => unknown) | undefined,
): string {
  return qualifyTopic(base, topicKey ? topicKey(variables) : variables);
}
