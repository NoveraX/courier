import type { Sources } from "../../define/types";
import { isChannelSchema } from "../../realtime/is-channel-schema";
import { resolveEndpoint } from "../../utils/execute-resolve";
import type { StreamEndpointLocator } from "./shared";

/**
 * What a WS endpoint is: a channel, which takes messages from the client,
 * or a push, which only sends — so a caller opens it with the executor of
 * its kind.
 *
 * @param sources - The sources the endpoint is looked up in
 * @param locator - Where the endpoint is
 * @returns `"channel"` or `"push"`; `undefined` when there is no WS endpoint there
 * @example
 * ```ts
 * const open = wsEndpointKind(sources, call) === "push" ? executeDirectWSPush : executeDirectWSChannel;
 * ```
 */
export function wsEndpointKind(
  sources: Sources,
  locator: StreamEndpointLocator,
): "channel" | "push" | undefined {
  const dataSource = Object.hasOwn(sources, locator.source) ? sources[locator.source] : undefined;
  if (!dataSource) return undefined;
  const { schema } = resolveEndpoint(dataSource, locator.group, locator.method);
  if (schema?.transport !== "ws") return undefined;
  return isChannelSchema(schema) ? "channel" : "push";
}
