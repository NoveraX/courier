import type { Webhook } from "@noverax/courier/webhooks";

/** Where a webhook is delivered, and with what. */
export interface WebhookDeliveryOptions<TBody> {
  /** The app's route for it: `http://localhost:3000/api/webhooks/stripe` */
  to: string;
  /** The event, as its sender would send it */
  body: TBody;
  /** Headers the sender adds beside its signature: an event's id, a delivery's */
  headers?: Record<string, string> | undefined;
  /** What sends it (default: the global `fetch`) */
  fetch?: typeof fetch | undefined;
}

/**
 * Deliver a webhook to the app as its sender would: the body as JSON, signed
 * with the webhook's own secret and scheme — so the app's handler checks it
 * exactly as it checks a real delivery. A mock calls it when it answers a
 * call that would make the provider send one, and a test to drive a flow
 * end to end, with no provider and no tunnel.
 *
 * @param webhook - The webhook, as `defineWebhook` declared it
 * @param options - Where it goes, the event, and what sends it
 * @returns How the app answered
 * @example
 * ```ts
 * await deliverWebhook(stripeEvents, {
 *   to: "http://localhost:3000/api/webhooks/stripe",
 *   body: { id: "evt_1", type: "invoice.paid", data: { object: invoice } },
 * });
 * ```
 */
export async function deliverWebhook<TBody>(
  webhook: Webhook<TBody>,
  options: WebhookDeliveryOptions<TBody>,
): Promise<Response> {
  const raw = JSON.stringify(options.body);
  const signed = await webhook.sign(raw);
  const send = options.fetch ?? fetch;
  return send(options.to, {
    method: "POST",
    headers: { "content-type": "application/json", ...options.headers, ...signed },
    body: raw,
  });
}
