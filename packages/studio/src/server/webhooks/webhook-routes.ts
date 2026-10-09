import type { RouteApp } from "../route-types";
import { isObject } from "../validate-body";
import { type DeliveryAsk, deliverWebhook } from "./deliver-webhook";
import type { WebhookDirectory } from "./webhook-directory";

const LONGEST_NAME = 200;
const LONGEST_ADDRESS = 2048;
const STATUS_OF = { unknown: 404, refused: 422, silent: 504 } as const;

/**
 * Mount the routes the pages send a webhook through, by the application
 * that defines it:
 *
 * POST /api/webhooks/list — the webhooks the attached applications define, with where their deliveries came to
 * POST /api/webhooks/deliver — `{ webhook, to, body }` → `{ status }`, the application's answer; the token is asked for
 *
 * @param app - The Studio server's Express app
 * @param directory - The webhooks the attached applications define
 * @param timeoutMs - How long an application has to say how a delivery went
 * @example
 * ```ts
 * registerWebhookRoutes(app, webhooks);
 * ```
 */
export function registerWebhookRoutes(
  app: RouteApp,
  directory: WebhookDirectory,
  timeoutMs?: number,
): void {
  app.post("/api/webhooks/list", (_req, res) => {
    res.json({ webhooks: directory.list() });
  });
  app.post("/api/webhooks/deliver", async (req, res) => {
    const ask = askOf(req.body);
    if (typeof ask === "string") {
      res.status(400).json({ error: ask });
      return;
    }
    const outcome = await deliverWebhook(directory, ask, timeoutMs);
    if (outcome.ok) res.json({ status: outcome.status });
    else res.status(STATUS_OF[outcome.reason]).json({ error: outcome.error });
  });
}

function askOf(raw: unknown): DeliveryAsk | string {
  const { webhook, to, body } = isObject(raw) ? raw : {};
  if (typeof webhook !== "string" || webhook === "" || webhook.length > LONGEST_NAME)
    return "Name the webhook: { webhook, to, body }.";
  if (typeof to !== "string" || to.length > LONGEST_ADDRESS || !URL.canParse(to))
    return "Say where the delivery goes, as an http or https address: { webhook, to, body }.";
  if (!/^https?:$/.test(new URL(to).protocol)) return `${to} is not an http or https address.`;
  if (body === undefined) return "Give the delivery's body: { webhook, to, body }.";
  return { webhook, to, body };
}
