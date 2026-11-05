import { canonicalJson } from "../utils/canonical-json";
import type { ClusterMessage } from "./cluster-message";

/** A signature as it travels: an HMAC-SHA-256 digest in lowercase hex. */
const SIGNATURE = /^[0-9a-f]{64}$/;

const encoder = new TextEncoder();

/** A cluster message before it is signed. */
export type UnsignedMessage = Omit<ClusterMessage, "sig">;

/** Signs the messages of one cluster, and tells them from anyone else's. */
export interface ClusterSigner {
  /** The signature of a message: HMAC-SHA-256 of its canonical JSON without `sig`, in hex */
  sign(message: UnsignedMessage): Promise<string>;
  /** Whether a message carries the signature this cluster's secret gives it */
  verify(message: ClusterMessage): Promise<boolean>;
}

/**
 * Sign and check cluster messages with the cluster's secret: HMAC-SHA-256
 * over the message's canonical JSON — its keys sorted, so a replica checks
 * what another signed whatever order the fields travelled in — through Web
 * Crypto, which Node and the edge runtimes share. The check is Web Crypto's
 * own, which compares digests in constant time.
 *
 * @param secret - The cluster's secret, the same on every replica
 * @returns The signer
 *
 * @example
 * ```ts
 * const signer = createClusterSigner(secret);
 * const sig = await signer.sign(message);
 * await signer.verify({ ...message, sig }); // true
 * ```
 */
export function createClusterSigner(secret: string): ClusterSigner {
  const key = crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  return {
    async sign(message) {
      return hexOf(await crypto.subtle.sign("HMAC", await key, signedBytes(message)));
    },
    async verify(message) {
      const { sig } = message;
      if (sig === undefined || !SIGNATURE.test(sig)) return false;
      return crypto.subtle.verify("HMAC", await key, digestOf(sig), signedBytes(message));
    },
  };
}

/* What is signed: the fields a replica acts on, never the signature itself. */
function signedBytes({ v, id, at, cmd }: UnsignedMessage): Uint8Array<ArrayBuffer> {
  return encoder.encode(canonicalJson({ v, id, at, cmd }));
}

function hexOf(digest: ArrayBuffer): string {
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function digestOf(hex: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from({ length: hex.length / 2 }, (_, i) =>
    Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16),
  );
}
