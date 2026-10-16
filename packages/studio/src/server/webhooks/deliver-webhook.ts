import { shownText } from "@noverax/courier/internal";

import { isPlainObject } from "../is-plain-object";
import type { WebhookDirectory } from "./webhook-directory";

/** What became of a delivery Studio asked an application for. */
export type DeliveryOutcome =
  | { ok: true; status: number }
  | { ok: false; error: string; reason: "unknown" | "refused" | "silent" };

/** A delivery to ask for: the webhook, where it goes, and the event. */
export interface DeliveryAsk {
  webhook: string;
  to: string;
  body: unknown;
}

/* The runtime waits 30 s for the handler; its answer then needs a moment to come back. */
const ANSWER_TIMEOUT_MS = 35_000;

/**
 * Have the application that defines a webhook deliver one: the runtime that
 * told of it last signs the body with the webhook's own secret and sends it
 * as its sender would. The delivery then shows in the Timeline, as every
 * delivery does, from the application's own handler.
 *
 * @param directory - The webhooks the attached applications define
 * @param ask - The webhook, where it goes, and the event
 * @param timeoutMs - How long the application has to say how the delivery went
 * @returns The status the application answered, or why there was no delivery
 * @example
 * ```ts
 * await deliverWebhook(webhooks, { webhook: "stripe", to: "http://localhost:3000/api/webhooks/stripe", body });
 * // { ok: true, status: 204 }
 * ```
 */
export function deliverWebhook(
  directory: WebhookDirectory,
  ask: DeliveryAsk,
  timeoutMs: number = ANSWER_TIMEOUT_MS,
): Promise<DeliveryOutcome> {
  const socket = directory.socketFor(ask.webhook);
  if (!socket) {
    return Promise.resolve({
      ok: false,
      reason: "unknown",
      error: `No app attached to Studio defines the ${ask.webhook} webhook. Start the app with its runtime attached; an app that loads a route when it is first requested, as Next.js does in development, defines the webhook once its route has been requested.`,
    });
  }
  return new Promise((resolve) => {
    socket
      .timeout(timeoutMs)
      .emit("webhook:deliver", ask, (error: Error | null, reply: unknown) => {
        if (error) {
          resolve({
            ok: false,
            reason: "silent",
            error: "The application did not say how the delivery went.",
          });
          return;
        }
        resolve(outcomeOf(reply));
      });
  });
}

function outcomeOf(reply: unknown): DeliveryOutcome {
  if (isPlainObject(reply) && reply.ok === true && typeof reply.status === "number") {
    return { ok: true, status: reply.status };
  }
  /* Cut as every error text Studio is told is, whichever runtime sent it. */
  const error =
    isPlainObject(reply) && typeof reply.error === "string" ? shownText(reply.error) : undefined;
  return { ok: false, reason: "refused", error: error ?? "The application did not deliver it." };
}
