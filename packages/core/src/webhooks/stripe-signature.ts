import { isRecent } from "./delivery-age";
import { readSecret } from "./read-secret";
import { hmacSha256, sameSignature, toHex } from "./signature-bytes";
import type { WebhookSecret, WebhookSignature } from "./types";

/**
 * Stripe's signature: the `Stripe-Signature` header's timestamp and `v1`
 * signatures, each the HMAC-SHA-256 of `<timestamp>.<body>` under the
 * endpoint's signing secret, `whsec_…`. A delivery older than five
 * minutes is refused as a replay.
 *
 * @param options - The signing secret, or what reads it
 * @returns The signature scheme
 * @example
 * ```ts
 * stripeSignature({ secret: () => process.env.STRIPE_WEBHOOK_SECRET });
 * ```
 */
export function stripeSignature(options: { secret: WebhookSecret }): WebhookSignature {
  const expected = async (timestamp: string, raw: string) =>
    toHex(await hmacSha256(readSecret(options.secret, "stripe"), `${timestamp}.${raw}`));
  return {
    scheme: "stripe",
    async verify(raw, headers, now) {
      const parts = (headers.get("stripe-signature") ?? "")
        .split(",")
        .map((part) => part.trim().split("="));
      const timestamp = parts.find(([key]) => key === "t")?.[1];
      const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value ?? "");
      if (!timestamp || signatures.length === 0 || !isRecent(timestamp, now)) return false;
      const wanted = await expected(timestamp, raw);
      return signatures.some((signature) => sameSignature(signature, wanted));
    },
    async sign(raw, now) {
      const timestamp = String(Math.floor(now / 1000));
      return { "stripe-signature": `t=${timestamp},v1=${await expected(timestamp, raw)}` };
    },
  };
}
