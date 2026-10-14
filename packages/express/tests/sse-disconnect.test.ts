/**
 * An SSE stream served through express, after its client disconnects.
 *
 * The stream ends with its client — not at the lifetime cap, 30 minutes by
 * default, holding its generator, its upstream subscription and its
 * connection slot — and `onSSEDisconnect` reports a disconnect, not
 * "max_lifetime".
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { registerSources } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";

import { courierSSEHandler } from "../src";

const { stream } = courier();
let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
});

describe("an SSE stream behind express", () => {
  it("stops, and reports a disconnect, when its client leaves", async () => {
    let finished = false;
    const reasons: string[] = [];
    const ticks = stream.response<number>().implement(async function* (ctx) {
      try {
        for (let n = 0; !ctx.signal.aborted; n += 1) {
          yield { data: n };
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      } finally {
        finished = true;
      }
    });
    registerSources({
      api: defineApi({ expose: true, baseURL: "https://upstream.example", endpoints: { ticks } }),
    });

    const app = express();
    app.get(
      "/api/sse",
      courierSSEHandler({
        onSSEDisconnect: ({ reason }) => {
          reasons.push(reason);
        },
      }),
    );
    server = createServer(app);
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    const client = new AbortController();
    const response = await fetch(`http://127.0.0.1:${port}/api/sse?_s=api&_m=ticks`, {
      headers: { accept: "text/event-stream" },
      signal: client.signal,
    });
    await response.body?.getReader().read();
    client.abort();

    await expect.poll(() => finished, { timeout: 2000 }).toBe(true);
    await expect.poll(() => reasons, { timeout: 2000 }).toEqual(["disconnect"]);
  });
});
