/**
 * `@noverax/courier/internal-streams` — in-process direct stream executors.
 *
 * **Internal subpath.** Public consumers must NOT depend on this module —
 * it exists exclusively for `@noverax/courier-studio` Playground to execute
 * SSE/WS endpoints in-process via the canonical pipeline (resolve → validate
 * → middleware → handler → instrument), so that Playground never
 * diverges from production behavior (auth, validation, broadcast, etc.).
 *
 * Stability: tracked alongside studio-core releases. No semver guarantees
 * for external consumers. Production realtime should use the canonical
 * adapter handlers from `@noverax/courier/realtime` and the per-framework
 * adapters from `@noverax/courier-{next,hono,express,fastify,nestjs}`.
 */

export { executeDirectSSE } from "../transport/in-process/sse";
export type {
  ExecuteDirectSSEPayload,
  ExecuteDirectStreamOptions,
  ExecuteDirectWSChannelOptions,
  ExecuteDirectWSChannelPayload,
  ExecuteDirectWSPushPayload,
  InProcessWSChannel,
} from "../transport/in-process/types";
export { executeDirectWSChannel } from "../transport/in-process/ws-channel";
export { executeDirectWSPush } from "../transport/in-process/ws-push";

export type {
  PlaygroundWSRegistry,
  PlaygroundWSSubscriber,
} from "../transport/in-process/ws-registry";
export {
  createPlaygroundWSRegistry,
  sharedPlaygroundWSRegistry,
} from "../transport/in-process/ws-registry";
