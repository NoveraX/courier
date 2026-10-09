import { post } from "@/lib/api-client";
import { isPlainObject } from "@/socket/is-plain-object";
import type { WebhookSendAsk } from "./webhook-send-store";

/** A webhook an attached app defines, as Studio lists it. */
export interface AppWebhook {
  name: string;
  /** How its sender signs a delivery: `stripe`, `github`, `standard`, `hmac`. */
  scheme: string;
  /** Where its deliveries came to, newest last. */
  routes: string[];
  /** The apps that define it, by their runtime's id. */
  apps: string[];
}

/**
 * The webhooks the apps attached to Studio define, each with where its
 * deliveries came to.
 *
 * @returns The webhooks, by name
 * @throws {StudioRequestError} When Studio could not list them
 * @example
 * ```ts
 * const webhooks = await listAppWebhooks(); // [{ name: "stripe", routes: [...], … }]
 * ```
 */
export async function listAppWebhooks(): Promise<AppWebhook[]> {
  const answer = await post<unknown>("/api/webhooks/list", {});
  const listed = isPlainObject(answer) && Array.isArray(answer.webhooks) ? answer.webhooks : [];
  return listed.filter(isAppWebhook);
}

/**
 * Have the app that defines a webhook deliver one: signed there with the
 * webhook's own secret, and sent to its route as its sender would.
 *
 * @param ask - The webhook, the route, and the event
 * @returns The status the app answered with
 * @throws {StudioRequestError} When there was no delivery, saying why
 * @example
 * ```ts
 * const { status } = await deliverAppWebhook({ webhook: "stripe", to, body }); // 204
 * ```
 */
export async function deliverAppWebhook(ask: WebhookSendAsk): Promise<{ status: number }> {
  const answer = await post<unknown>("/api/webhooks/deliver", ask);
  if (!isPlainObject(answer) || typeof answer.status !== "number")
    throw new Error("Studio did not say how the delivery went.");
  return { status: answer.status };
}

function isAppWebhook(value: unknown): value is AppWebhook {
  return (
    isPlainObject(value) &&
    typeof value.name === "string" &&
    typeof value.scheme === "string" &&
    Array.isArray(value.routes) &&
    value.routes.every((route: unknown) => typeof route === "string") &&
    Array.isArray(value.apps)
  );
}
