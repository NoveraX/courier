import { readSecret } from "./read-secret";
import { hmacSha256, sameSignature, toBase64, toHex } from "./signature-bytes";
import type { WebhookSecret, WebhookSignature } from "./types";

/** How a service of your own signs: the header, how the HMAC is written, and what comes before it. */
export interface HmacSignatureOptions {
  secret: WebhookSecret;
  /** The header that carries the signature: `x-signature` */
  header: string;
  /** How the HMAC-SHA-256 is written (default: `hex`) */
  encoding?: "hex" | "base64" | undefined;
  /** What the header's value starts with before the signature: `sha256=` */
  prefix?: string | undefined;
}

/**
 * A signature of your own: one header carrying the HMAC-SHA-256 of the body
 * under a shared secret, written in hex or base64 after a prefix. It signs
 * no timestamp, so it cannot tell a replay; prefer Standard Webhooks for a
 * service you write yourself.
 *
 * @param options - The secret, the header, the encoding and the prefix
 * @returns The signature scheme
 * @example
 * ```ts
 * hmacSignature({ secret: () => process.env.BILLING_SECRET, header: "x-billing-signature", prefix: "sha256=" });
 * ```
 */
export function hmacSignature(options: HmacSignatureOptions): WebhookSignature {
  const header = options.header.toLowerCase();
  const expected = async (raw: string) => {
    const bytes = await hmacSha256(readSecret(options.secret, "hmac"), raw);
    return `${options.prefix ?? ""}${options.encoding === "base64" ? toBase64(bytes) : toHex(bytes)}`;
  };
  return {
    scheme: "hmac",
    async verify(raw, headers) {
      const signature = headers.get(header);
      return signature !== null && sameSignature(signature, await expected(raw));
    },
    async sign(raw) {
      return { [header]: await expected(raw) };
    },
  };
}
