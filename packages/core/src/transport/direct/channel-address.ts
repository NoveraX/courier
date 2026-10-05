/**
 * Where a channel another server serves is subscribed to, as its source's
 * definition says — by a direct caller, and by a proxy relaying it.
 */

import { getSourceName } from "../../define/api";
import { buildDirectWSUrl, buildWSTopic } from "../../realtime/ws-address";
import { addressCall } from "./address";
import { placedEndpoint } from "./placed-endpoint";
import { fieldOf, textOf } from "./read-definition";

/** Where a channel is: the socket's URL, and the topic it is subscribed to on it */
export interface ChannelAddress {
  /** The source's base as a WebSocket URL, the group's prefix, then the path the endpoint declares */
  readonly url: string;
  /** `source.group.method`, which the serving server resolves the channel by */
  readonly topic: string;
}

/**
 * The address of a channel another server serves. The URL follows the path
 * the channel's closure addressed; the topic stays keyed on its name, which
 * is how the server resolves it, and the server validates the whole of the
 * variables it is sent.
 *
 * @param api - The source
 * @param group - The channel's group's path, empty for none
 * @param method - The channel's name
 * @param variables - What it is subscribed with; its path takes its parameters from them
 * @returns The address
 * @throws RealtimeValidationError when a path parameter is missing or would change the route
 * @example
 * ```ts
 * channelAddress(api, "chat", "room", { room: "r1" });
 * // → { url: "wss://rt.example.com/chat/r1", topic: "api.chat.room" }
 * ```
 */
export function channelAddress(
  api: object,
  group: string,
  method: string,
  variables: unknown,
): ChannelAddress {
  const options = fieldOf(api, "options");
  const { definition, prefix } = placedEndpoint(api, group, method);
  const { path } = addressCall(definition, method, variables);
  const sourceName = getSourceName(api) ?? "_";
  return {
    url: buildDirectWSUrl(textOf(options, "baseURL"), prefix, path),
    topic: buildWSTopic(sourceName, group, method),
  };
}
