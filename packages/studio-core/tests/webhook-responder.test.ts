/**
 * Studio has a webhook delivered through the application that defines it:
 * the runtime tells Studio which webhooks the application has and where
 * their deliveries came to — on connecting, and whenever that changes —
 * and delivers one when asked, signed here with the webhook's own secret,
 * so the application's handler takes it as its sender's. A delivery goes
 * only to this machine or where the webhook's deliveries came to, and a
 * webhook the application does not define is refused.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { studioHooks } from "@noverax/courier/internal";
import { sendWebResponse, toWebRequest } from "@noverax/courier/node";
import { defineWebhook, stripeSignature } from "@noverax/courier/webhooks";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { answerWebhookDeliveries } from "../src/runtime/webhook-responder";

const received: unknown[] = [];
const payouts = defineWebhook({
  name: "responder-payouts",
  signature: stripeSignature({ secret: "whsec_responder" }),
  body: z.object({ id: z.string(), type: z.string() }),
  event: (body) => body.type,
});
const handle = payouts.handler((body) => {
  received.push(body);
});
let app: Server;
let route: string;

beforeAll(async () => {
  app = createServer(async (req, res) => {
    await sendWebResponse(await handle(toWebRequest(req, res)), res);
  });
  await new Promise<void>((done) => app.listen(0, "127.0.0.1", done));
  route = `http://127.0.0.1:${(app.address() as AddressInfo).port}/webhooks/payouts`;
});
afterAll(() => new Promise((done) => app.close(done)));

function studioSocket(connected = true) {
  const handlers = new Map<string, (asked: unknown, answer: unknown) => Promise<void>>();
  const emit = vi.fn();
  const socket = {
    connected,
    on: (event: string, handler: (asked: unknown, answer: unknown) => Promise<void>) => {
      handlers.set(event, handler);
    },
    emit,
  };
  const ask = async (asked: unknown) => {
    const answer = vi.fn();
    await handlers.get("webhook:deliver")?.(asked, answer);
    return answer.mock.calls[0]?.[0];
  };
  return { socket: socket as never, emit, ask };
}

describe("a webhook delivered for Studio", () => {
  it("is signed with the webhook's own secret, so the application's handler takes it", async () => {
    const { socket, ask } = studioSocket();
    answerWebhookDeliveries(socket);
    received.length = 0;

    const answer = await ask({
      webhook: "responder-payouts",
      to: route,
      body: { id: "evt_7", type: "payout.paid" },
    });

    expect(answer).toEqual({ ok: true, status: 204 });
    expect(received).toEqual([{ id: "evt_7", type: "payout.paid" }]);
  });

  it("goes only to this machine or where the webhook's deliveries came to", async () => {
    const { socket, ask } = studioSocket();
    const send = vi.fn(async () => new Response(null, { status: 204 }));
    answerWebhookDeliveries(socket, send);
    const body = { id: "evt_8", type: "payout.paid" };

    const elsewhere = await ask({
      webhook: "responder-payouts",
      to: "https://hooks.example/payouts",
      body,
    });
    const scheme = await ask({ webhook: "responder-payouts", to: "file:///etc/hosts", body });
    const unknown = await ask({ webhook: "responder-nothing", to: route, body });
    const unnamed = await ask({ to: route, body });
    const local = await ask({
      webhook: "responder-payouts",
      to: "http://localhost:3000/hook",
      body,
    });
    studioHooks.onRequestStart = () => undefined;
    await handle(
      new Request("http://192.168.1.20:3000/webhooks/payouts", { method: "POST", body: "{}" }),
    );
    studioHooks.onRequestStart = undefined;
    const seen = await ask({
      webhook: "responder-payouts",
      to: "http://192.168.1.20:3000/webhooks/payouts?attempt=2",
      body,
    });

    expect(elsewhere).toEqual({
      ok: false,
      error:
        "https://hooks.example/payouts is neither on this machine nor where the responder-payouts webhook's deliveries came to: a delivery signed here goes to one of those only.",
    });
    expect(scheme).toEqual({
      ok: false,
      error: "file:///etc/hosts is not an http or https address.",
    });
    expect(unknown).toEqual({
      ok: false,
      error: "This application defines no webhook named responder-nothing.",
    });
    expect(unnamed).toMatchObject({ ok: false });
    expect(local).toEqual({ ok: true, status: 204 });
    expect(seen).toEqual({ ok: true, status: 204 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(
      "http://localhost:3000/hook",
      expect.objectContaining({
        method: "POST",
        body: '{"id":"evt_8","type":"payout.paid"}',
        headers: expect.objectContaining({
          "stripe-signature": expect.stringMatching(/^t=\d+,v1=/),
        }),
      }),
    );
  });

  it("says why when the application could not be reached", async () => {
    const { socket, ask } = studioSocket();
    answerWebhookDeliveries(socket, async () => {
      throw new TypeError("fetch failed");
    });

    expect(
      await ask({ webhook: "responder-payouts", to: "http://localhost:1/hook", body: {} }),
    ).toEqual({ ok: false, error: "The delivery to http://localhost:1/hook failed: fetch failed" });
  });

  it("says why with no token a failure quoted", async () => {
    const { socket, ask } = studioSocket();
    answerWebhookDeliveries(socket, async () => {
      throw new TypeError('Headers.append: "Bearer B34rer\nx" is an invalid header value.');
    });

    expect(
      await ask({ webhook: "responder-payouts", to: "http://localhost:1/hook", body: {} }),
    ).toEqual({
      ok: false,
      error:
        'The delivery to http://localhost:1/hook failed: Headers.append: "[redacted]" is an invalid header value.',
    });
  });

  it("tells Studio of the webhooks while connected, and again as they change, until stopped", () => {
    const { socket, emit } = studioSocket();
    const offline = studioSocket(false);
    const webhooks = answerWebhookDeliveries(socket);
    answerWebhookDeliveries(offline.socket).announce();

    webhooks.announce();
    defineWebhook({
      name: "responder-later",
      signature: stripeSignature({ secret: "whsec_later" }),
      body: z.object({}),
    });
    webhooks.stop();
    defineWebhook({
      name: "responder-after-stop",
      signature: stripeSignature({ secret: "whsec_after" }),
      body: z.object({}),
    });

    const told = emit.mock.calls.map(([event, payload]) => [
      event,
      payload.webhooks.map((one: { name: string }) => one.name),
    ]);
    expect(offline.emit).not.toHaveBeenCalled();
    expect(told).toHaveLength(2);
    expect(told[0]?.[0]).toBe("runtime:webhooks");
    expect(told[0]?.[1]).toContain("responder-payouts");
    expect(told[1]?.[1]).toContain("responder-later");
    expect(emit.mock.calls[0]?.[1].webhooks).toContainEqual({
      name: "responder-payouts",
      scheme: "stripe",
      routes: ["http://192.168.1.20:3000/webhooks/payouts"],
    });
  });
});
