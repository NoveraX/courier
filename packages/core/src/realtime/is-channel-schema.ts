import type { SchemaMetadata } from "../validation";

/**
 * Whether a WS endpoint is a channel, which takes messages from the client,
 * rather than a push, which only sends: it declared what it takes with
 * `.send()`, or was marked bidirectional.
 *
 * @param schema - The endpoint's schema metadata
 * @returns Whether it is a channel
 * @example
 * ```ts
 * if (isChannelSchema(schema)) await startChannel(ctx, topic, endpoint, variables);
 * ```
 */
export function isChannelSchema(
  schema: Pick<SchemaMetadata, "bidirectional" | "receive"> | undefined,
): boolean {
  return schema?.bidirectional === true || schema?.receive !== undefined;
}
