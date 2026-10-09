/**
 * Typed webhooks: a delivery is checked against its sender's signature —
 * Stripe's, GitHub's, Standard Webhooks', or one of your own — over the
 * body exactly as it came, before anything is parsed; then against its
 * schema; and only then handed to the handler. A refusal names its status
 * and nothing more. Each delivery shows in Studio as a webhook call.
 */
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { studioHooks } from "../src/studio";
import {
  defineWebhook,
  githubSignature,
  hmacSignature,
  standardWebhookSignature,
  stripeSignature,
} from "../src/webhooks";

const NOW = Date.parse("2026-10-09T05:00:00Z");

describe("the signatures", () => {
  it("checks GitHub's own example, and refuses a body changed after signing", async () => {
    const github = githubSignature({ secret: "It's a Secret to Everybody" });
    const headers = new Headers({
      "x-hub-signature-256":
        "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
    });

    expect(await github.verify("Hello, World!", headers, NOW)).toBe(true);
    expect(await github.verify("Hello, World?", headers, NOW)).toBe(false);
  });

  it("checks the Standard Webhooks example, and refuses it five minutes later", async () => {
    const standard = standardWebhookSignature({ secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw" });
    const headers = new Headers({
      "webhook-id": "msg_p5jXN8AQM9LWM0D4loKWxJek",
      "webhook-timestamp": "1614265330",
      "webhook-signature": "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
    });

    expect(await standard.verify('{"test": 2432232314}', headers, 1614265330 * 1000)).toBe(true);
    expect(await standard.verify('{"test": 2432232314}', headers, (1614265330 + 301) * 1000)).toBe(
      false,
    );
  });

  it("signs as Stripe does — the same HMAC node:crypto computes — and refuses another secret or a replay", async () => {
    const stripe = stripeSignature({ secret: "whsec_test" });
    const raw = '{"id":"evt_1","type":"invoice.paid"}';

    const signed = new Headers(await stripe.sign(raw, NOW));
    const timestamp = Math.floor(NOW / 1000);
    const independent = createHmac("sha256", "whsec_test")
      .update(`${timestamp}.${raw}`)
      .digest("hex");

    expect(signed.get("stripe-signature")).toBe(`t=${timestamp},v1=${independent}`);
    expect(await stripe.verify(raw, signed, NOW)).toBe(true);
    expect(await stripeSignature({ secret: "whsec_other" }).verify(raw, signed, NOW)).toBe(false);
    expect(await stripe.verify(raw, signed, NOW + 6 * 60 * 1000)).toBe(false);
  });

  it("checks the same example under Svix's own header names, which Clerk and Resend deliver with", async () => {
    const standard = standardWebhookSignature({ secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw" });
    const at = 1614265330 * 1000;
    const svix = new Headers({
      "svix-id": "msg_p5jXN8AQM9LWM0D4loKWxJek",
      "svix-timestamp": "1614265330",
      "svix-signature": "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
    });
    const otherId = new Headers(svix);
    otherId.set("svix-id", "msg_other");

    expect(await standard.verify('{"test": 2432232314}', svix, at)).toBe(true);
    expect(await standard.verify('{"test": 2432232314}', otherId, at)).toBe(false);
  });

  it("refuses a timestamp that is not whole seconds, even under a signature that matches it", async () => {
    const raw = "{}";
    const forged = createHmac("sha256", "whsec_test").update(`1e9.${raw}`).digest("hex");
    const stripe = stripeSignature({ secret: "whsec_test" });

    const verified = await stripe.verify(
      raw,
      new Headers({ "stripe-signature": `t=1e9,v1=${forged}` }),
      1e12,
    );

    expect(verified).toBe(false);
  });

  it("names a Standard Webhooks secret that is not base64 instead of refusing every signature", async () => {
    const broken = standardWebhookSignature({ secret: "whsec_not base64!" });

    await expect(broken.sign("{}", NOW)).rejects.toMatchObject({ code: "WEBHOOK_SECRET_INVALID" });
  });

  it("checks a signature of your own, in base64 after a prefix", async () => {
    const own = hmacSignature({
      secret: "s3cret",
      header: "X-Billing-Signature",
      encoding: "base64",
      prefix: "sha256=",
    });
    const raw = "{}";
    const independent = `sha256=${createHmac("sha256", "s3cret").update(raw).digest("base64")}`;

    expect(await own.verify(raw, new Headers({ "x-billing-signature": independent }), NOW)).toBe(
      true,
    );
    expect(
      await own.verify(raw, new Headers({ "x-billing-signature": `${independent}x` }), NOW),
    ).toBe(false);
  });
});

describe("a webhook's deliveries", () => {
  const Invoice = z.object({ id: z.string(), type: z.string(), amount: z.number() });
  const invoices = defineWebhook({
    name: "billing",
    signature: githubSignature({ secret: "s3cret" }),
    body: Invoice,
    event: (body) => body.type,
  });

  async function deliver(raw: string, sign = true): Promise<Request> {
    const headers = sign ? await invoices.sign(raw) : { "x-hub-signature-256": "sha256=00" };
    return new Request("https://app.example/webhooks/billing", {
      method: "POST",
      body: raw,
      headers,
    });
  }

  it("hands a signed delivery that passes the schema to the handler, typed, and answers 204", async () => {
    const seen = vi.fn();
    const handle = invoices.handler(seen);

    const response = await handle(await deliver('{"id":"in_1","type":"invoice.paid","amount":12}'));

    expect(response.status).toBe(204);
    expect(seen).toHaveBeenCalledWith(
      { id: "in_1", type: "invoice.paid", amount: 12 },
      expect.objectContaining({ event: "invoice.paid" }),
    );
  });

  it("refuses a bad signature, a body that is not JSON and one the schema refuses — before the handler runs", async () => {
    const seen = vi.fn();
    const handle = invoices.handler(seen);

    const statuses = [
      (await handle(await deliver('{"id":"in_1","type":"x","amount":1}', false))).status,
      (await handle(await deliver("not json"))).status,
      (await handle(await deliver('{"id":"in_1","type":"x"}'))).status,
    ];

    expect(statuses).toEqual([401, 400, 422]);
    expect(seen).not.toHaveBeenCalled();
  });

  it("answers as the handler does, 500 when it throws, and refuses every delivery without a secret", async () => {
    const raw = '{"id":"in_1","type":"invoice.paid","amount":12}';
    const accepted = invoices.handler(() => Response.json({ ok: true }, { status: 202 }));
    const failing = invoices.handler(() => {
      throw new Error("database down");
    });
    const unset = defineWebhook({
      name: "x",
      signature: githubSignature({ secret: () => undefined }),
      body: Invoice,
    });

    expect((await accepted(await deliver(raw))).status).toBe(202);
    expect((await failing(await deliver(raw))).status).toBe(500);
    expect((await unset.handler(vi.fn())(await deliver(raw))).status).toBe(500);
  });

  it("refuses a body over the limit at the chunk that crosses it, without reading the rest first", async () => {
    const small = defineWebhook({
      name: "billing",
      signature: githubSignature({ secret: "s3cret" }),
      body: Invoice,
      maxBodyBytes: 100_000,
    });
    const seen = vi.fn();
    let pulled = 0;
    const chunk = new Uint8Array(64 * 1024).fill(32);
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 100) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const request = new Request("https://app.example/webhooks/billing", {
      method: "POST",
      body: endless,
      duplex: "half",
    } as RequestInit);

    const response = await small.handler(seen)(request);
    const pulledAtRefusal = pulled;

    expect(response.status).toBe(413);
    expect(pulledAtRefusal).toBeLessThan(50);
    expect(seen).not.toHaveBeenCalled();
  });

  it("hands a delivery over unnamed when reading its event throws, rather than refuse it", async () => {
    const reading = defineWebhook({
      name: "billing",
      signature: githubSignature({ secret: "s3cret" }),
      body: Invoice,
      event: () => {
        throw new Error("no type here");
      },
    });
    const seen = vi.fn();

    const response = await reading.handler(seen)(
      await deliver('{"id":"in_1","type":"invoice.paid","amount":12}'),
    );

    expect(response.status).toBe(204);
    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({ id: "in_1" }),
      expect.objectContaining({ event: undefined }),
    );
  });
});

describe("a delivery in Studio", () => {
  const start = vi.fn();
  const end = vi.fn();
  const error = vi.fn();
  const passed = vi.fn();
  const refused = vi.fn();
  const hook = defineWebhook({
    name: "billing",
    signature: githubSignature({ secret: "s3cret" }),
    body: z.object({ type: z.string(), amount: z.number() }),
    event: (body) => body.type,
  });

  async function delivery(raw: string, signed = true): Promise<Request> {
    return new Request("https://app.example/w", {
      method: "POST",
      body: raw,
      headers: signed ? await hook.sign(raw) : { "x-hub-signature-256": "sha256=00" },
    });
  }

  beforeEach(() => {
    studioHooks.onRequestStart = start;
    studioHooks.onRequestEnd = end;
    studioHooks.onRequestError = error;
    studioHooks.onValidationPass = passed;
    studioHooks.onValidationFail = refused;
  });

  afterEach(() => {
    studioHooks.onRequestStart = undefined;
    studioHooks.onRequestEnd = undefined;
    studioHooks.onRequestError = undefined;
    studioHooks.onValidationPass = undefined;
    studioHooks.onValidationFail = undefined;
    vi.clearAllMocks();
  });

  it("shows as a webhook call named by its event, its body passed, answered with what the handler returned", async () => {
    const handle = hook.handler(() => Response.json({ queued: true }, { status: 202 }));

    await handle(await delivery('{"type":"invoice.paid","amount":12}'));
    await vi.waitFor(() => expect(end).toHaveBeenCalled());

    expect(start.mock.calls[0]?.[0]).toMatchObject({
      source: "billing",
      method: "invoice.paid",
      mode: "webhook",
      variables: { type: "invoice.paid", amount: 12 },
    });
    expect(passed.mock.calls[0]?.[0]).toMatchObject({ target: "variables" });
    const answered = end.mock.calls[0]?.[0];
    expect(answered).toMatchObject({ status: 202, data: { queued: true }, size: 15 });
    expect(answered.timing.validation).toBeLessThanOrEqual(answered.timing.total);
    expect(answered.requestHeaders["x-hub-signature-256"]).toMatch(/^sha256=/);
  });

  it("shows a refused signature with the headers the delivery came with, and no body", async () => {
    await hook.handler(vi.fn())(await delivery('{"type":"x","amount":1}', false));

    expect(start.mock.calls[0]?.[0]).toMatchObject({ method: "delivery", variables: undefined });
    expect(error.mock.calls[0]?.[0]).toMatchObject({
      status: 401,
      error: { type: "http", status: 401 },
      requestHeaders: { "x-hub-signature-256": "sha256=00" },
      data: { error: "The delivery's signature does not match" },
    });
    expect(passed).not.toHaveBeenCalled();
  });

  it("shows a body the schema refused, signed by its sender, with each place it refused", async () => {
    await hook.handler(vi.fn())(await delivery('{"type":"invoice.paid","amount":"12"}'));

    expect(start.mock.calls[0]?.[0]).toMatchObject({
      method: "delivery",
      variables: { type: "invoice.paid", amount: "12" },
    });
    expect(refused.mock.calls[0]?.[0].issues[0]).toMatchObject({ path: ["amount"] });
    expect(error.mock.calls[0]?.[0]).toMatchObject({
      status: 422,
      error: { type: "validation" },
      data: { issues: [{ path: "amount" }] },
    });
  });
});
