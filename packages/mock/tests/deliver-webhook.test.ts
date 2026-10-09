/**
 * A mock delivers a webhook to the app as its sender would: signed with the
 * webhook's own secret and scheme, so the app's handler checks it as it
 * checks a real delivery — and a delivery signed with another secret is
 * refused by the same handler.
 */
import { defineWebhook, stripeSignature } from "@noverax/courier/webhooks";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { deliverWebhook } from "../src/deliver-webhook";

const Event = z.object({ id: z.string(), type: z.string() });

function webhook(secret: string) {
  return defineWebhook({
    name: "stripe",
    signature: stripeSignature({ secret }),
    body: Event,
    event: (body) => body.type,
  });
}

describe("delivering a webhook", () => {
  it("reaches the app's handler signed as the sender signs it", async () => {
    const seen = vi.fn();
    const handle = webhook("whsec_shared").handler(seen);

    const response = await deliverWebhook(webhook("whsec_shared"), {
      to: "http://localhost:3000/api/webhooks/stripe",
      body: { id: "evt_1", type: "invoice.paid" },
      fetch: async (url, init) => handle(new Request(url, init)),
    });

    expect(response.status).toBe(204);
    expect(seen).toHaveBeenCalledWith(
      { id: "evt_1", type: "invoice.paid" },
      expect.objectContaining({ event: "invoice.paid" }),
    );
  });

  it("is refused by a handler that holds another secret", async () => {
    const handle = webhook("whsec_app").handler(vi.fn());

    const response = await deliverWebhook(webhook("whsec_mock"), {
      to: "http://localhost:3000/api/webhooks/stripe",
      body: { id: "evt_1", type: "invoice.paid" },
      fetch: async (url, init) => handle(new Request(url, init)),
    });

    expect(response.status).toBe(401);
  });
});
