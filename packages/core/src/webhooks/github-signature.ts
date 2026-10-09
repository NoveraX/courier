import { readSecret } from "./read-secret";
import { hmacSha256, sameSignature, toHex } from "./signature-bytes";
import type { WebhookSecret, WebhookSignature } from "./types";

/**
 * GitHub's signature: the `X-Hub-Signature-256` header, `sha256=` and the
 * HMAC-SHA-256 of the body under the webhook's secret. GitHub signs no
 * timestamp, so each delivery's `X-GitHub-Delivery` id is what tells a
 * replay — keep the ids you have handled if replays matter to you.
 *
 * @param options - The webhook's secret, or what reads it
 * @returns The signature scheme
 * @example
 * ```ts
 * githubSignature({ secret: () => process.env.GITHUB_WEBHOOK_SECRET });
 * ```
 */
export function githubSignature(options: { secret: WebhookSecret }): WebhookSignature {
  const expected = async (raw: string) =>
    `sha256=${toHex(await hmacSha256(readSecret(options.secret, "github"), raw))}`;
  return {
    scheme: "github",
    async verify(raw, headers) {
      const signature = headers.get("x-hub-signature-256");
      return signature !== null && sameSignature(signature, await expected(raw));
    },
    async sign(raw) {
      return { "x-hub-signature-256": await expected(raw) };
    },
  };
}
