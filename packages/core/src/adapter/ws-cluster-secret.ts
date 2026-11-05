import { ConfigurationError } from "../errors";
import type { ClusterOptions } from "./ws-types";

/** The shortest cluster secret taken, in bytes: an HMAC-SHA-256 key no shorter than its digest. */
const MIN_SECRET_BYTES = 32;

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
