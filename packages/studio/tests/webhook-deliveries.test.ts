/**
 * A page has a webhook delivered by the application that defines it: each
 * runtime that presented the project's token says which webhooks its
 * application defines — another runtime is not heard — and the pages list
 * them, with where their deliveries came to. A delivery asks the runtime
 * that told of the webhook last, which answers how the application took it;
 * the token is asked for, and a webhook no attached application defines, a
 * runtime's refusal and a runtime that never answers each say why.
 */
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { Server } from "socket.io";
import { type Socket as ClientSocket, io as connect } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

import { BindingTable } from "../src/server/catalog/binding-table";
import { setupRuntimeNamespace } from "../src/server/runtime-namespace";
import { clearStudioServerState } from "../src/server/runtime-namespace-state";
import { TOKEN_HEADER, tokenGuard } from "../src/server/token-guard";
import { createWebhookDirectory } from "../src/server/webhooks/webhook-directory";
import { registerWebhookRoutes } from "../src/server/webhooks/webhook-routes";
import { FIXED_TOKEN, FIXED_TOKEN_VALUE } from "./helpers/fixed-token";

const STRIPE = {
  name: "stripe",
  scheme: "stripe",
  routes: ["http://localhost:3000/api/webhooks/stripe"],
};

let http: HttpServer | undefined;
const runtimes: ClientSocket[] = [];

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.disconnect();
  await new Promise((done) => (http ? http.close(done) : done(undefined)));
  http = undefined;
  clearStudioServerState();
});

async function studio() {
  const app = express();
  app.use(tokenGuard(FIXED_TOKEN));
  app.use(express.json());
  const webhooks = createWebhookDirectory();
  registerWebhookRoutes(app, webhooks, 300);
  http = createServer(app);
  const sockets = new Server(http);
  setupRuntimeNamespace(sockets.of("/runtime"), {
    bindingTable: new BindingTable(),
    token: FIXED_TOKEN,
    webhooks,
  });
  await new Promise<void>((done) => http?.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const post = async (
    path: string,
    body: unknown,
    token: string | undefined = FIXED_TOKEN_VALUE,
  ) => {
    const response = await fetch(`${url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token && { [TOKEN_HEADER]: token }) },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  return { url, post };
}

/* A runtime as attachRuntime opens one: hello, then the webhooks its application defines. */
async function runtime(
  url: string,
  options: {
    id: string;
    token?: string | undefined;
    webhooks: unknown[];
    answer?: (ask: unknown) => unknown;
  },
) {
  const asked: unknown[] = [];
  const socket = connect(`${url}/runtime`, {
    transports: ["websocket"],
    auth: options.token === undefined ? {} : { token: options.token },
  });
  runtimes.push(socket);
  socket.on("webhook:deliver", (ask: unknown, ack: (reply: unknown) => void) => {
    asked.push(ask);
    const reply = options.answer?.(ask);
    if (reply !== undefined) ack(reply);
  });
  await new Promise<void>((done) => socket.on("connect", () => done()));
  socket.emit("runtime:hello", { runtimeId: options.id, kind: "server" });
  socket.emit("runtime:webhooks", { webhooks: options.webhooks });
  await new Promise((done) => setTimeout(done, 50));
  return { socket, asked };
}

describe("a webhook delivered from a page", () => {
  it("is listed as the trusted runtimes tell it, and delivered by the one that told of it last", async () => {
    const { url, post } = await studio();
    const first = await runtime(url, {
      id: "billing-app",
      token: FIXED_TOKEN_VALUE,
      webhooks: [STRIPE],
      answer: () => ({ ok: true, status: 204 }),
    });
    await runtime(url, {
      id: "stranger",
      webhooks: [{ name: "github", scheme: "github", routes: [] }],
      answer: () => ({ ok: true, status: 204 }),
    });
    const second = await runtime(url, {
      id: "billing-worker",
      token: FIXED_TOKEN_VALUE,
      webhooks: [{ ...STRIPE, routes: ["http://localhost:4000/hooks/stripe"] }],
      answer: () => ({ ok: true, status: 202 }),
    });
    const body = { id: "evt_1", type: "invoice.paid" };

    const listed = await post("/api/webhooks/list", {});
    const delivered = await post("/api/webhooks/deliver", {
      webhook: "stripe",
      to: STRIPE.routes[0],
      body,
    });

    expect(listed.body).toEqual({
      webhooks: [
        {
          name: "stripe",
          scheme: "stripe",
          routes: [
            "http://localhost:3000/api/webhooks/stripe",
            "http://localhost:4000/hooks/stripe",
          ],
          apps: ["billing-app", "billing-worker"],
        },
      ],
    });
    expect(delivered).toEqual({ status: 200, body: { status: 202 } });
    expect(second.asked).toEqual([{ webhook: "stripe", to: STRIPE.routes[0], body }]);
    expect(first.asked).toEqual([]);
  });

  it("asks for the token, and says why when no application defines it, one refuses, or none answers", async () => {
    const { url, post } = await studio();
    await runtime(url, {
      id: "billing-app",
      token: FIXED_TOKEN_VALUE,
      webhooks: [STRIPE, { name: "silent", scheme: "hmac", routes: [] }],
      answer: (ask) =>
        (ask as { webhook: string }).webhook === "silent"
          ? undefined
          : {
              ok: false,
              error:
                "https://hooks.example is neither on this machine nor where the stripe webhook's deliveries came to.",
            },
    });
    const ask = { webhook: "stripe", to: "https://hooks.example", body: {} };

    expect(await post("/api/webhooks/deliver", ask, "")).toMatchObject({
      status: 401,
      body: { code: "STUDIO_TOKEN_REQUIRED" },
    });
    expect(await post("/api/webhooks/deliver", { ...ask, webhook: "github" })).toEqual({
      status: 404,
      body: {
        error: expect.stringContaining("No app attached to Studio defines the github webhook"),
      },
    });
    expect(await post("/api/webhooks/deliver", ask)).toEqual({
      status: 422,
      body: { error: expect.stringContaining("is neither on this machine") },
    });
    expect(await post("/api/webhooks/deliver", { ...ask, webhook: "silent" })).toEqual({
      status: 504,
      body: { error: "The application did not say how the delivery went." },
    });
    expect(await post("/api/webhooks/deliver", { ...ask, to: "file:///etc/hosts" })).toMatchObject({
      status: 400,
    });
    expect(
      await post("/api/webhooks/deliver", { webhook: "stripe", to: STRIPE.routes[0] }),
    ).toMatchObject({
      status: 400,
    });
  });

  it("says why an application could not deliver it, as it said it, to the page that holds the token", async () => {
    const { url, post } = await studio();
    await runtime(url, {
      id: "older-app",
      token: FIXED_TOKEN_VALUE,
      webhooks: [STRIPE],
      answer: () => ({
        ok: false,
        error:
          'The delivery failed: Headers.append: "Bearer B34rer\nx" is an invalid header value.',
      }),
    });

    expect(
      await post("/api/webhooks/deliver", {
        webhook: "stripe",
        to: "https://hooks.example",
        body: {},
      }),
    ).toEqual({
      status: 422,
      body: {
        error:
          'The delivery failed: Headers.append: "Bearer B34rer\nx" is an invalid header value.',
      },
    });
  });

  it("is forgotten with the runtime that told of it", async () => {
    const { url, post } = await studio();
    const app = await runtime(url, {
      id: "billing-app",
      token: FIXED_TOKEN_VALUE,
      webhooks: [STRIPE],
      answer: () => ({ ok: true, status: 204 }),
    });

    app.socket.disconnect();
    await new Promise((done) => setTimeout(done, 100));

    expect(await post("/api/webhooks/list", {})).toEqual({ status: 200, body: { webhooks: [] } });
    expect(
      (await post("/api/webhooks/deliver", { webhook: "stripe", to: STRIPE.routes[0], body: {} }))
        .status,
    ).toBe(404);
  });
});
