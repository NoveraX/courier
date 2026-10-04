import type { Sources } from "../../define/types";
import { channelHandlersOf } from "../../realtime/implementation";
import { streamLabel } from "../../realtime/stream-label";
import type { ChannelHandlers } from "../../realtime/types";
import { servedTopic } from "../../realtime/ws/served-topic";
import { generateRequestId } from "../../studio";
import { runTransportMiddleware } from "../../utils/transport-middleware";
import { instrumentWSChannel } from "../instrument";
import {
  buildSyntheticRequest,
  resolveStreamEndpoint,
  validateStreamVariables,
  wrapStreamError,
} from "./shared";
import type {
  ExecuteDirectWSChannelOptions,
  ExecuteDirectWSChannelPayload,
  InProcessWSChannel,
} from "./types";
import { createChannelState } from "./ws-channel-state";
import { sharedPlaygroundWSRegistry } from "./ws-registry";

const EXECUTOR = "executeDirectWSChannel";

/**
 * Execute a WS bidirectional channel endpoint in-process.
 *
 * Reuses the canonical pipeline (resolve → validate variables → middleware
 * → factory → onJoin → instrument). Returns a `WSChannel` whose `send`,
 * `on("data")`, and `close` are wired to the server's `ChannelHandlers`
 * (`onMessage`, `onLeave`) and to the playground broadcast registry.
 *
 * Multiple in-process channels subscribing to the same fully-qualified topic
 * can broadcast between each other via `channelCtx.broadcast(topic, data)` —
 * mirrors canonical `broadcastToTopic` semantics (sender is excluded).
 *
 * Throws synchronously on resolution / variables / onJoin failure.
 */
export async function executeDirectWSChannel(
  sources: Sources,
  payload: ExecuteDirectWSChannelPayload,
  options: ExecuteDirectWSChannelOptions = {},
): Promise<InProcessWSChannel> {
  const registry = options.registry ?? sharedPlaygroundWSRegistry;
  const { endpoint, schema, topicKey } = resolveStreamEndpoint(
    sources,
    payload,
    "channel",
    EXECUTOR,
  );
  const variables = await validateStreamVariables(payload.variables, schema);

  const requestId = generateRequestId();
  await runTransportMiddleware({
    transport: "ws",
    sources,
    source: payload.source,
    group: payload.group,
    method: payload.method,
    variables,
    request: buildSyntheticRequest(payload.headers),
    requestId,
  });

  const baseTopic = streamLabel(payload);
  let handlers: ChannelHandlers;
  try {
    handlers = channelHandlersOf(endpoint, variables, baseTopic);
  } catch (error) {
    throw wrapStreamError(EXECUTOR, "channel factory init failed", error);
  }

  const topic = servedTopic(baseTopic, variables, topicKey);
  const connectionId = crypto.randomUUID();

  // Subscribe up-front so cross-channel broadcasts work even if a peer
  // publishes inside its own onJoin (race-free, mirrors canonical
  // ws-endpoints which subscribes before awaiting onJoin).
  let unsubscribeFn: () => void = () => {};
  const state = createChannelState({
    topic,
    variables,
    connectionId,
    schema,
    handlers,
    broadcast: (t, data, exclude) => registry.broadcast(t, data, exclude),
    unsubscribeFromRegistry: () => unsubscribeFn(),
  });
  unsubscribeFn = registry.subscribe(topic, {
    connectionId,
    // Remote broadcast (from another channel) → fan out to this client's
    // local data listeners. The sender held it to the schema already.
    emit: (data) => state.deliver(data),
  });

  try {
    await handlers.onJoin?.(state.channelCtx);
  } catch (error) {
    unsubscribeFn();
    throw wrapStreamError(EXECUTOR, "onJoin failed", error);
  }

  state.markConnected();

  if (options.signal) {
    if (options.signal.aborted) void state.close();
    else options.signal.addEventListener("abort", () => void state.close(), { once: true });
  }

  return instrumentWSChannel(
    state.client,
    {
      source: payload.source,
      group: payload.group,
      method: payload.method,
      transport: "ws",
      mode: "direct",
      requestHeaders: payload.headers ?? {},
    },
    options.requestId,
  );
}
