import { SubscriptionHandle } from "./subscription-handle";
import type { Subscription } from "./subscription-types";
import type { WSConnectionConfig } from "./ws/ws-types";
import { topicDriver } from "./ws-topic-driver";

/**
 * Execute a WS push-only subscription: what calling a channel that only
 * pushes returns. It is read as every subscription is — `on("data")`,
 * `for await` — and opens once the server runs it.
 *
 * @param url - The WebSocket URL
 * @param topic - The endpoint's topic
 * @param variables - The subscription's variables
 * @param config - The socket's options, or a promise of them
 * @returns The subscription
 * @example
 * ```ts
 * const ticks = executeWSPush<number>("wss://api.example.com/ws", "api.live.ticker");
 * ticks.on("data", (tick) => console.log(tick));
 * ```
 */
export function executeWSPush<TData>(
  url: string,
  topic: string,
  variables?: unknown,
  config?: Partial<WSConnectionConfig> | Promise<Partial<WSConnectionConfig> | undefined>,
): Subscription<TData> {
  return new SubscriptionHandle<TData>(topicDriver<TData>(url, topic, variables, config));
}
