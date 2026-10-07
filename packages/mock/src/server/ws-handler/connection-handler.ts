import { logger } from "@noverax/courier";
import type { HeartbeatConfig, StreamFailure } from "@noverax/courier/internal";
import type { WebSocket as NodeWebSocket } from "ws";

import type { MockChannelFn, MockHistoryEntry } from "../../types";
import type { RequestHooks } from "../route-types";
import { keepAlive } from "../ws-keep-alive";
import type { WSConnectionRegistry } from "./connection-registry";
import { dispatchMessage, parseMessage } from "./message-router";
import { generateConnectionId } from "./protocol";
import { parseVariablesFromUrl, requestPath, type WSRoute } from "./route-resolver";
import { socketSubscriptions } from "./socket-subscriptions";

/** Per-connection activation parameters */
export interface ActivateConnectionParams {
  ws: NodeWebSocket;
  route: WSRoute;
  channelFn: MockChannelFn;
  url: string;
  history: MockHistoryEntry[];
  /** Told of the channel as it opens and ends — Studio's mock logs */
  hooks?: RequestHooks | undefined;
  registry: WSConnectionRegistry;
  scenarioState: string;
  /** How often the socket is pinged, and how long its pong may take */
  heartbeat?: HeartbeatConfig | undefined;
}

/**
 * Activate a single mock WS connection.
 *
 * The socket serves any number of subscriptions to its channel, one per
 * topic, each with handlers built for the variables it carries; when the
 * socket closes, every subscription it still holds runs its `onLeave` once.
 * Studio's mock logs see the connection open and end, with the first
 * channel whose handlers could not be built as its error.
 */
export function activateConnection(params: ActivateConnectionParams): void {
  const { ws, route, url, history, hooks, scenarioState } = params;
  const connectionId = generateConnectionId();
  const variables = { ...parseVariablesFromUrl(url), ...route.params };
  const startedAt = performance.now();

  const historyEntry: MockHistoryEntry = {
    group: route.group,
    method: route.method,
    variables,
    mocked: true,
    duration: 0,
    timestamp: Date.now(),
    result: { status: 101, data: undefined },
    channel: true,
  };
  history.push(historyEntry);
  const path = requestPath(url) ?? url;
  hooks?.onStart?.(connectionId, "GET", path, route.group, route.method, variables);
  let failure: StreamFailure | undefined;

  const socket = socketSubscriptions({
    ws,
    connectionId,
    defaultTopic: `${route.group}.${route.method}`,
    channelFn: params.channelFn,
    registry: params.registry,
    scenarioState,
    variables,
    failed: (reason) => {
      failure ??= reason;
    },
  });
  const alive = keepAlive(ws, params.heartbeat);

  ws.on("message", (raw: Buffer | string) => {
    const msg = parseMessage(ws, raw);
    if (!msg) return;
    if (msg.type === "pong") return alive.receivedPong();
    void dispatchMessage(msg, socket).catch((error: unknown) =>
      logger.warn("MockWS", `Message handling failed (${connectionId})`, error),
    );
  });

  ws.on("close", async () => {
    await Promise.all([...socket.subscriptions.values()].map((each) => socket.leave(each)));
    historyEntry.duration = performance.now() - startedAt;
    if (failure) {
      hooks?.onError?.(connectionId, failure.code, failure.message, historyEntry.duration);
    } else {
      hooks?.onEnd?.(connectionId, 101, undefined, historyEntry.duration, 0, scenarioState);
    }
  });

  ws.on("error", (err: Error) => {
    logger.warn("MockWS", `Connection error (${connectionId})`, err);
    // ws will fire "close" after "error" — cleanup happens there
  });
}
