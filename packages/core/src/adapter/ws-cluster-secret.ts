import { ConfigurationError } from "../errors";
import { createLogger } from "../logger";
import type { PubSubAdapter } from "../realtime/adapters";
import { isInProcess } from "../realtime/in-process-adapters";
import type { ClusterOptions } from "./ws-types";

/** The shortest cluster secret taken, in bytes: an HMAC-SHA-256 key no shorter than its digest. */
const MIN_SECRET_BYTES = 32;

const log = createLogger("Cluster");

/* Each adapter is named once, however many handlers share it: a WebSocket and an SSE handler do. */
const unsignedOver = new WeakSet<PubSubAdapter>();

/**
 * The cluster's secret, checked: what signs the commands replicas send each
 * other, and hashes the keys a limit on connections counts.
 *
 * @param cluster - The handler's `cluster` option
 * @param factory - What made the handler, which the error names
 * @returns The secret, or undefined for a cluster with none
 * @throws ConfigurationError for a secret shorter than 32 bytes, or one no Web Crypto can use
 *
 * @example
 * ```ts
 * const secret = clusterSecretOf({ secret: process.env.COURIER_CLUSTER_SECRET }, "createWSHandler");
 * ```
 */
export function clusterSecretOf(
  cluster: ClusterOptions | undefined,
  factory: string,
): string | undefined {
  const secret: unknown = cluster?.secret;
  if (secret === undefined) return undefined;
  if (typeof secret !== "string" || new TextEncoder().encode(secret).length < MIN_SECRET_BYTES) {
    throw new ConfigurationError(
      "CLUSTER_SECRET_INVALID",
      `[courier] ${factory}({ cluster: { secret } }) takes a secret of ${MIN_SECRET_BYTES} bytes or more, the same on every replica — \`openssl rand -hex 32\` makes one.`,
    );
  }
  if (typeof globalThis.crypto?.subtle?.importKey !== "function") {
    throw new ConfigurationError(
      "CLUSTER_SECRET_INVALID",
      `[courier] ${factory}({ cluster: { secret } }) signs with Web Crypto, which this runtime does not have.`,
    );
  }
  return secret;
}

/**
 * Say once for an adapter that the commands replicas send each other over
 * it are taken unsigned: whoever can publish on its channels — anything
 * else its Redis reaches — can close any connection, or ask every one for
 * its credentials again. What the replicas do is the same either way:
 * signing stays the cluster's choice. A bus in the process is not named:
 * nothing outside the process can publish on it, and a line every local
 * run logs for nothing teaches to read none.
 *
 * @param pubsub - The adapter the commands travel over
 * @example
 * ```ts
 * if (secret === undefined) warnUnsignedCommands(pubsub);
 * ```
 */
export function warnUnsignedCommands(pubsub: PubSubAdapter): void {
  if (isInProcess(pubsub) || unsignedOver.has(pubsub)) return;
  unsignedOver.add(pubsub);
  log.warn(
    `Commands between replicas are taken unsigned: whoever can publish on the pub/sub adapter's channels can close any connection. Give every replica the same cluster: { secret } of ${MIN_SECRET_BYTES} bytes or more — \`openssl rand -hex 32\` makes one.`,
  );
}
