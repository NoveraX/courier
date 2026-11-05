import { ConfigurationError } from "../errors";
import type { WSHandlerConfig } from "./ws-types";

/** The shortest cluster secret taken, in bytes: an HMAC-SHA-256 key no shorter than its digest. */
const MIN_SECRET_BYTES = 32;

/**
 * The cluster's secret, checked: what signs the commands replicas send each
 * other, and hashes the keys a limit on connections counts.
 *
 * @param config - The handler's options
 * @returns The secret, or undefined for a cluster with none
 * @throws ConfigurationError for a secret shorter than 32 bytes, or one no Web Crypto can use
 *
 * @example
 * ```ts
 * const secret = clusterSecretOf({ cluster: { secret: process.env.COURIER_CLUSTER_SECRET } });
 * ```
 */
export function clusterSecretOf(config: WSHandlerConfig): string | undefined {
  const secret: unknown = config.cluster?.secret;
  if (secret === undefined) return undefined;
  if (typeof secret !== "string" || new TextEncoder().encode(secret).length < MIN_SECRET_BYTES) {
    throw new ConfigurationError(
      "CLUSTER_SECRET_INVALID",
      `[courier] createWSHandler({ cluster: { secret } }) takes a secret of ${MIN_SECRET_BYTES} bytes or more, the same on every replica — \`openssl rand -hex 32\` makes one.`,
    );
  }
  if (typeof globalThis.crypto?.subtle?.importKey !== "function") {
    throw new ConfigurationError(
      "CLUSTER_SECRET_INVALID",
      "[courier] createWSHandler({ cluster: { secret } }) signs with Web Crypto, which this runtime does not have.",
    );
  }
  return secret;
}
