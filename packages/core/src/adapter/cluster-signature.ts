import { canonicalJson } from "../utils/canonical-json";
import type { ClusterMessage } from "./cluster-message";

/** A signature as it travels: an HMAC-SHA-256 digest in lowercase hex. */
const SIGNATURE = /^[0-9a-f]{64}$/;

const encoder = new TextEncoder();

/** A message one replica sends another, and the signature it travels with, if any. */
export interface SignedMessage {
  readonly sig?: string | undefined;
}

/** A cluster message before it is signed. */
export type UnsignedMessage = Omit<ClusterMessage, "sig">;

/** Signs the messages of one cluster on one channel, and tells them from anyone else's. */
export interface ClusterSigner {
  /** The signature of a message: HMAC-SHA-256 of its canonical JSON without `sig`, with the channel's name, in hex */
  sign(message: UnsignedMessage): Promise<string>;
  /** Whether a message carries the signature this cluster's secret gives it on this channel */
  verify(message: ClusterMessage): Promise<boolean>;
}

/** Signs a cluster's messages for whichever channel each travels on. */
export interface ChannelSigner {
  /** The signature of a message on `channel`: HMAC-SHA-256 of its canonical JSON without `sig`, with the channel's name, in hex */
  sign(channel: string, message: object): Promise<string>;
  /** Whether a message read on `channel` carries the signature this cluster's secret gives it there */
  verify(channel: string, message: SignedMessage): Promise<boolean>;
}

/**
 * Sign and check cluster messages with the cluster's secret, for the
 * channel they travel on: HMAC-SHA-256 over the canonical JSON of the
 * message and the channel's name — its keys sorted, so a replica checks
 * what another signed whatever order the fields travelled in — through Web
 * Crypto, which Node and the edge runtimes share. A message signed for one
 * channel is refused on another: a WebSocket handlers' command is none for
 * the SSE handlers, and the other way round. The check is Web Crypto's
 * own, which compares digests in constant time.
 *
 * @param secret - The cluster's secret, the same on every replica
 * @param channel - The channel the messages travel on, as the adapter is given it
 * @returns The signer
 *
 * @example
 * ```ts
 * const signer = createClusterSigner(secret, CONTROL_CHANNEL);
 * const sig = await signer.sign(message);
 * await signer.verify({ ...message, sig }); // true
 * ```
 */
export function createClusterSigner(secret: string, channel: string): ClusterSigner {
  const signer = createChannelSigner(secret);
  return {
    sign: (message) => signer.sign(channel, message),
    verify: (message) => signer.verify(channel, message),
  };
}

/**
 * Sign and check a cluster's messages on any channel, as
 * `createClusterSigner` does on one: for a replica that answers on each
 * asker's channel. What is signed is every field of the message but its
 * signature, so a reader checks the message it built of the fields it acts
 * on — one carrying fields it does not know fails the check.
 *
 * @param secret - The cluster's secret, the same on every replica
 * @returns The signer
 *
 * @example
 * ```ts
 * const signer = createChannelSigner(secret);
 * const sig = await signer.sign("courier:ws:http:3f9c0a7d51e2b864", message);
 * await signer.verify("courier:ws:http:3f9c0a7d51e2b864", { ...message, sig }); // true
 * ```
 */
export function createChannelSigner(secret: string): ChannelSigner {
  const key = crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  /* What is signed: the fields a replica acts on and the channel they came by, never the signature
     itself; the channel's name last, so no field can stand for it. */
  function signedBytes(channel: string, message: object): Uint8Array<ArrayBuffer> {
    const { sig: _, ...fields } = message as SignedMessage;
    return encoder.encode(canonicalJson({ ...fields, channel }));
  }

  return {
    async sign(channel, message) {
      return hexOf(await crypto.subtle.sign("HMAC", await key, signedBytes(channel, message)));
    },
    async verify(channel, message) {
      const { sig } = message;
      if (sig === undefined || !SIGNATURE.test(sig)) return false;
      return crypto.subtle.verify("HMAC", await key, digestOf(sig), signedBytes(channel, message));
    },
  };
}

function hexOf(digest: ArrayBuffer): string {
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function digestOf(hex: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from({ length: hex.length / 2 }, (_, i) =>
    Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16),
  );
}
