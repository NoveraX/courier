import type { RefusalLog } from "../logger/refusal-log";
import { createClusterControl } from "./cluster-control";
import { clusterSecretOf } from "./ws-cluster-secret";
import { runCommand } from "./ws-connection-command";
import { createPubSubBridge, type PubSubBridge } from "./ws-pubsub-bridge";
import type { InternalConnectionRegistry } from "./ws-registry-types";
import { replicateRegistry } from "./ws-replicated-registry";
import type { WSHandlerConfig } from "./ws-types";

/** What a handler shares with the other replicas through its pub/sub adapter. */
export interface Replication {
  /** Topic subscriptions and broadcasts between replicas */
  readonly bridge: PubSubBridge;
  /** The registry application code is handed: its broadcasts and commands reach every replica */
  readonly connections: InternalConnectionRegistry;
  /** Let go of the adapter's channels, without waiting on it */
  destroy(): void;
}

/**
 * Join a handler to the other replicas sharing its pub/sub adapter: the
 * topics its connections subscribe to, the broadcasts it makes, and the
 * commands — `disconnect`, `requireAuth` — it sends and takes on the
 * control channel, signed when the cluster has a secret.
 *
 * @param config - The handler's options
 * @param registry - This replica's connections
 * @param refusals - The handler's log of refusals
 * @returns The replication, or undefined for a handler with no adapter
 * @throws ConfigurationError for a `cluster.secret` shorter than 32 bytes, or one no Web Crypto can use
 *
 * @example
 * ```ts
 * const replication = replicate(config, registry, refusals);
 * const connections = replication?.connections ?? registry;
 * ```
 */
export function replicate(
  config: WSHandlerConfig,
  registry: InternalConnectionRegistry,
  refusals: RefusalLog,
): Replication | undefined {
  const secret = clusterSecretOf(config);
  const { pubsub } = config;
  if (!pubsub) return undefined;
  const bridge = createPubSubBridge(pubsub, registry, refusals);
  const control = createClusterControl({
    pubsub,
    secret,
    run: (checked) => {
      runCommand(checked, registry);
    },
    refusals,
  });
  /* Back from an outage, the adapter may have missed what other replicas
     published: every subscription is told, and resumes nothing from before. */
  let previous = pubsub.state;
  const stopHearing = pubsub.onStateChange((state) => {
    if (state === "ready" && previous === "degraded") registry.resyncAll();
    previous = state;
  });
  return {
    bridge,
    connections: replicateRegistry(registry, bridge, control),
    destroy() {
      stopHearing();
      bridge.destroy();
      control.destroy();
    },
  };
}
