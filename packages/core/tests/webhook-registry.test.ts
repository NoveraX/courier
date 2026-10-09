/**
 * The webhooks an application defines, kept for Studio: each by its name —
 * a reload's new definition in the old one's place — with what signs a body
 * as its sender would, so a delivery Studio has sent passes the handler's
 * own check; and, while Studio is attached, where its deliveries came to,
 * newest last and without the query, which Studio is told of as it learns.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { studioHooks } from "../src/studio";
import { defineWebhook, hmacSignature, stripeSignature } from "../src/webhooks";
import { knownWebhooks, onKnownWebhooks } from "../src/webhooks/webhook-registry";

const body = z.object({ id: z.string(), type: z.string() });

afterEach(() => {
  studioHooks.onRequestStart = undefined;
});

function delivery(url: string, raw: string, headers: Record<string, string>): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: raw,
  });
}

describe("the webhooks an application defines", () => {
  it("are kept by name, signing a body as the handler checks it", async () => {
    const billing = defineWebhook({
      name: "registry-billing",
      signature: stripeSignature({ secret: "whsec_registry" }),
      body,
    });
    const handled = vi.fn();
    const handler = billing.handler(handled);
    const raw = '{"id":"evt_1","type":"invoice.paid"}';

    const known = knownWebhooks().find((one) => one.name === "registry-billing");
    const answer = await handler(
      delivery("http://localhost:3000/api/webhooks/billing", raw, (await known?.sign(raw)) ?? {}),
    );

    expect(known).toMatchObject({ name: "registry-billing", scheme: "stripe", routes: [] });
    expect(answer.status).toBe(204);
    expect(handled).toHaveBeenCalledWith({ id: "evt_1", type: "invoice.paid" }, expect.anything());
  });

  it("keep where deliveries came to while Studio is attached, telling it of each new place", async () => {
    const told = vi.fn();
    const stop = onKnownWebhooks(told);
    const audit = defineWebhook({
      name: "registry-audit",
      signature: hmacSignature({ secret: "audit-secret", header: "x-audit-signature" }),
      body,
    });
    const handler = audit.handler(() => undefined);
    const send = (url: string) => handler(delivery(url, "{}", {}));

    await send("http://localhost:3000/before-attach");
    studioHooks.onRequestStart = () => undefined;
    await send("http://localhost:3000/hooks/audit?attempt=1");
    await send("http://localhost:3000/hooks/audit?attempt=2");
    await send("http://127.0.0.1:4000/audit");
    await send("http://localhost:3000/hooks/audit");
    stop();
    await send("http://localhost:5000/after");

    expect(knownWebhooks().find((one) => one.name === "registry-audit")?.routes).toEqual([
      "http://127.0.0.1:4000/audit",
      "http://localhost:3000/hooks/audit",
      "http://localhost:5000/after",
    ]);
    expect(told).toHaveBeenCalledTimes(4);
  });

  it("take a reload's new definition in the old one's place, keeping where it is mounted", async () => {
    const first = defineWebhook({
      name: "registry-reloaded",
      signature: stripeSignature({ secret: "whsec_old" }),
      body,
    });
    studioHooks.onRequestStart = () => undefined;
    await first.handler(() => undefined)(delivery("http://localhost:3000/hooks/r", "{}", {}));
    const second = defineWebhook({
      name: "registry-reloaded",
      signature: stripeSignature({ secret: "whsec_new" }),
      body,
    });
    const raw = '{"id":"evt_2","type":"payout.paid"}';

    const known = knownWebhooks().filter((one) => one.name === "registry-reloaded");
    const signed = (await known[0]?.sign(raw)) ?? {};

    expect(known).toHaveLength(1);
    expect(known[0]?.routes).toEqual(["http://localhost:3000/hooks/r"]);
    expect(
      (await second.handler(() => undefined)(delivery("http://x.test/", raw, signed))).status,
    ).toBe(204);
    expect(
      (await first.handler(() => undefined)(delivery("http://x.test/", raw, signed))).status,
    ).toBe(401);
  });
});
