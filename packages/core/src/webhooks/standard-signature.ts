import { ConfigurationError } from "../errors/configuration-error";
import { isRecent } from "./delivery-age";
import { readSecret } from "./read-secret";
import { fromBase64, hmacSha256, sameSignature, toBase64 } from "./signature-bytes";
import type { WebhookSecret, WebhookSignature } from "./types";

const PREFIX = "whsec_";

/* Svix sends its own names for the same three headers; Standard Webhooks senders send these. */
const HEADER_NAMES = [
  { id: "webhook-id", timestamp: "webhook-timestamp", signature: "webhook-signature" },
  { id: "svix-id", timestamp: "svix-timestamp", signature: "svix-signature" },
] as const;

/**
 * The Standard Webhooks signature, which Svix sends and Clerk, Resend and
 * many others deliver with: `webhook-id`, `webhook-timestamp` and
 * `webhook-signature` — or Svix's `svix-id`, `svix-timestamp` and
 * `svix-signature` — the signature `v1,` and the base64 HMAC-SHA-256 of
 * `<id>.<timestamp>.<body>` under the secret's key, `whsec_<base64>`;
 * several signatures, separated by spaces, while a secret is rotated. A
 * delivery older than five minutes is refused as a replay.
 *
 * @param options - The signing secret, or what reads it
 * @returns The signature scheme
 * @throws {ConfigurationError} `WEBHOOK_SECRET_INVALID` when a delivery comes and the secret is not `whsec_` and base64
 * @example
 * ```ts
 * standardWebhookSignature({ secret: () => process.env.CLERK_WEBHOOK_SECRET });
 * ```
 */
export function standardWebhookSignature(options: { secret: WebhookSecret }): WebhookSignature {
  const expected = async (id: string, timestamp: string, raw: string) =>
    toBase64(await hmacSha256(signingKey(options.secret), `${id}.${timestamp}.${raw}`));
  return {
    scheme: "standard",
    async verify(raw, headers, now) {
      const names = HEADER_NAMES.find((each) => headers.has(each.signature)) ?? HEADER_NAMES[0];
      const id = headers.get(names.id);
      const timestamp = headers.get(names.timestamp);
      const signatures = (headers.get(names.signature) ?? "")
        .split(" ")
        .filter((part) => part.startsWith("v1,"));
      if (!id || !timestamp || signatures.length === 0 || !isRecent(timestamp, now)) return false;
      const wanted = await expected(id, timestamp, raw);
      return signatures.some((part) => sameSignature(part.slice(3), wanted));
    },
    async sign(raw, now) {
      const id = `msg_${crypto.randomUUID().replace(/-/g, "")}`;
      const timestamp = String(Math.floor(now / 1000));
      return {
        "webhook-id": id,
        "webhook-timestamp": timestamp,
        "webhook-signature": `v1,${await expected(id, timestamp, raw)}`,
      };
    },
  };
}

function signingKey(secret: WebhookSecret): Uint8Array<ArrayBuffer> {
  const text = readSecret(secret, "standard");
  const key = fromBase64(text.startsWith(PREFIX) ? text.slice(PREFIX.length) : text);
  if (key && key.length > 0) return key;
  throw new ConfigurationError(
    "WEBHOOK_SECRET_INVALID",
    "[courier] the standard webhook's signing secret is not `whsec_` and base64: copy it whole from the sender's dashboard",
  );
}
