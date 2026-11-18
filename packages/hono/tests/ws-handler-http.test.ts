/**
 * The HTTP transport of `courierWSHandler`: a client whose network lets no
 * WebSocket through opens the same connection with a `POST` to the socket's
 * path, routed with `app.post(path, ws.http)`, ahead of the application's
 * own handlers for that path.
 */
import { registerSources } from "@noverax/courier";
import { defineApi } from "@noverax/courier/define";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type CourierWSRoute, courierWSHandler } from "../src";

/** A poll that opens a connection: its head, then the client's `auth` frame, of protocol version 2. */
const OPEN = `${JSON.stringify({ op: "poll", v: 1 })}\n${JSON.stringify({ type: "auth", v: 2, id: "a0" })}`;

let ws: CourierWSRoute | undefined;

beforeEach(() => {
  registerSources({ api: defineApi({ baseURL: "https://upstream.example", endpoints: {} }) });
});

afterEach(async () => {
  await ws?.destroy();
  ws = undefined;
});

describe("courierWSHandler's HTTP transport", () => {
  it("answers a POST on the socket's path, routed ahead of the application's", async () => {
    const app = new Hono();
    ws = courierWSHandler();
    app.post("/ws", ws.http);
    app.post("/ws", (c) => c.text("the application's", 418));

    const response = await app.request("/ws", {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: OPEN,
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(body).toMatch(/^event: open\n/);
    expect(body).toContain('"type":"auth_ok"');
  });
});
