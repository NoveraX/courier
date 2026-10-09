import { ConfigurationError } from "../errors/configuration-error";
import type { WebhookSecret } from "./types";

/**
 * A webhook's secret, read when a delivery comes. A webhook without one
 * refuses every delivery rather than take an unsigned one.
 *
 * @param secret - The secret, or what reads it
 * @param scheme - The signature's scheme, for the message
 * @returns The secret
 * @throws {ConfigurationError} `WEBHOOK_SECRET_MISSING` when there is none
 * @example
 * ```ts
 * readSecret(() => process.env.STRIPE_WEBHOOK_SECRET, "stripe");
 * ```
 */
export function readSecret(secret: WebhookSecret, scheme: string): string {
  const value = typeof secret === "function" ? secret() : secret;
  if (typeof value !== "string" || value === "") {
    throw new ConfigurationError(
      "WEBHOOK_SECRET_MISSING",
      `[courier] the ${scheme} webhook has no signing secret, so every delivery is refused: set the secret the sender signs with`,
    );
  }
  return value;
}
