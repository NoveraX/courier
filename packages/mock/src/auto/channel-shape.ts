import type { ChannelShape } from "../server/prefix-route-types";
import type { SchemaMetadata } from "./route-types";
import { prop } from "./schema-introspect/prop";

/**
 * What the proxy's WebSocket route checks a subscription to a channel
 * against, read from the channel's definition: the schemas of its variables
 * and of what it receives, whether it receives anything, and the `.topic()`
 * reader its subscribers share a topic by.
 *
 * @param endpoint - The channel's definition
 * @param schema - Its schema metadata
 * @returns The shape
 * @example
 * ```ts
 * channelShape(api.chat.room, extractSchema(api.chat.room)).topicKey?.({ room: "r1", user: "ada" });
 * // → { room: "r1" }
 * ```
 */
export function channelShape(endpoint: unknown, schema: SchemaMetadata | undefined): ChannelShape {
  const topicKey = prop(endpoint, "options", "topicKey");
  return {
    ...(schema?.variables && { variables: schema.variables }),
    ...(schema?.receive && { receive: schema.receive }),
    acceptsMessages: schema?.bidirectional === true || schema?.receive !== undefined,
    ...(isReader(topicKey) && { topicKey }),
  };
}

function isReader(value: unknown): value is (variables: unknown) => unknown {
  return typeof value === "function";
}
