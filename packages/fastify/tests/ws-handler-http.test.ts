/**
 * The HTTP transport of `courierWSHandler`: a client whose network lets no
 * WebSocket through opens the same connection with a `POST` to the socket's
 * path, routed with `fastify.post(path, ws.http)`. It is answered from the
 * route's `onRequest`, before Fastify reads the body — no parser of Fastify's,
 * and no `bodyLimit`, has it — while the application's own `onRequest` hooks
 * see it, as they see the upgrade.
 */
import { registerSources } from "@noverax/courier";
import { defineApi } from "@noverax/courier/define";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { courierWSHandler } from "../src";

/** A poll that opens a connection: its head, then the client's `auth` frame, of protocol version 2. */
const OPEN = `${JSON.stringify({ op: "poll", v: 1 })}\n${JSON.stringify({ type: "auth", v: 2, id: "a0" })}`;

let app: FastifyInstance | undefined;

beforeEach(() => {
  registerSources({ api: defineApi({ baseURL: "https://upstream.example", endpoints: {} }) });
});

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("courierWSHandler's HTTP transport", () => {
  it("answers a POST on the socket's path before Fastify reads its body", async () => {
    /* Fastify's own text parser would refuse this body with 413. */
    app = Fastify({ bodyLimit: OPEN.length - 1 });
    const seen: string[] = [];
    app.addHook("onRequest", async (request) => {
      seen.push(`${request.method} ${request.url}`);
    });
    const ws = courierWSHandler();
    app.post("/api/ws", ws.http);
    app.addHook("preClose", () => ws.destroy());
    const origin = await app.listen({ port: 0, host: "127.0.0.1" });

    const response = await fetch(`${origin}/api/ws`, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: OPEN,
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(body).toMatch(/^event: open\n/);
    expect(body).toContain('"type":"auth_ok"');
    expect(seen).toEqual(["POST /api/ws"]);
  });
});
