import type { RefusalLog } from "../logger/refusal-log";
import { createClusterControl } from "./cluster-control";
import type { HandlerConfig } from "./handler-config";
import type { InternalSSERegistry } from "./sse-registry";
import type { SSEConnectionRegistry } from "./sse-types";
import { clusterSecretOf } from "./ws-cluster-secret";
import { disconnectCommand } from "./ws-connection-command";

/**
 * The channel the SSE handlers' commands travel on, under the adapter's
 * prefix: apart from the WebSocket handlers', whose commands name their
 * own connections.
 */
export const SSE_CONTROL_CHANNEL = "courier:sse:control";

/** What an SSE handler shares with the other replicas through its pub/sub adapter. */
export interface SSEReplication {
  /** The registry application code is handed: `disconnect` reaches every replica's streams */
  readonly connections: SSEConnectionRegistry;
  /** Stop hearing the other replicas' commands */
  destroy(): void;
}

/**
 * Join an SSE handler to the other replicas sharing its pub/sub adapter:
 * `disconnect` ends the streams a selector names wherever they are held,
 * its command signed when the cluster has a secret, and the handler ends
 * its own streams the others' commands name. Everything else stays with
 * this replica, which holds the streams.
 *
 * @param config - The handler's options
 * @param registry - This replica's streams
 * @param refusals - The handler's log of refusals, for a command refused
 * @returns The replication, or undefined for a handler with no adapter
 * @throws ConfigurationError for a `cluster.secret` shorter than 32 bytes, or one no Web Crypto can use
 * @example
 * ```ts
 * const replication = replicateSSE(config, registry, refusals);
 * await (replication?.connections ?? registry).disconnect({ meta: { userId: "u1" } });
 * ```
 */
export function replicateSSE(
  config: HandlerConfig | undefined,
  registry: InternalSSERegistry,
  refusals: RefusalLog,
): SSEReplication | undefined {
  const secret = clusterSecretOf(config?.cluster, "createHandler");
  const pubsub = config?.pubsub;
  if (!pubsub) return undefined;
  const control = createClusterControl({
    pubsub,
    secret,
    refusals,
    channel: SSE_CONTROL_CHANNEL,
    /* A stream is only ever ended: asking one for credentials again has no meaning. */
    run: ({ command, selection }) => {
      if (command.kind !== "disconnect") return;
      for (const entry of registry.select(selection)) entry.abort();
    },
  });

  const connections: SSEConnectionRegistry = {
    get count() {
      return registry.count;
    },
    get isShuttingDown() {
      return registry.isShuttingDown;
    },
    get: (connectionId) => registry.get(connectionId),
    has: (connectionId) => registry.has(connectionId),
    list: (selector) => registry.list(selector),
    getByEndpoint: (source, group, method) => registry.getByEndpoint(source, group, method),
    /* A stream is held by one replica alone: when each id named is this one's, no other has any. */
    async disconnect(selector) {
      const { command, selection } = disconnectCommand(selector, undefined);
      const ended = registry.select(selection);
      for (const entry of ended) entry.abort();
      if ("ids" in selection && ended.length === new Set(selection.ids).size) return;
      await control.send(command);
    },
    disconnectAll: () => registry.disconnectAll(),
    send: (connectionId, event) => registry.send(connectionId, event),
    broadcastToEndpoint: (source, event, group, method) =>
      registry.broadcastToEndpoint(source, event, group, method),
    broadcastToMeta: (fields, event) => registry.broadcastToMeta(fields, event),
    broadcastAll: (event) => registry.broadcastAll(event),
  };
  return { connections, destroy: () => control.destroy() };
}
