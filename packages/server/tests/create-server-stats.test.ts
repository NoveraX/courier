/**
 * A standalone server's stats(): its WebSocket handler's, and the SSE
 * streams it holds open, as a metrics scrape or a health check reads them.
 */
import { defineApi } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { createCourierServer } from "../src/create-server";
import type { CourierServer } from "../src/types";

let server: CourierServer | undefined;
const clients: WebSocket[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate();
  await server?.stop();
  server = undefined;
});

describe("CourierServer.stats()", () => {
  it("reports its WebSocket handler's connections, and the streams it holds open", async () => {
    const api = defineApi({ baseURL: "http://127.0.0.1:1", endpoints: {} });
    server = createCourierServer({ sources: { api }, port: 0, host: "127.0.0.1", signals: false });
    expect(server.stats()).toMatchObject({
      ws: { connections: 0, stopping: false },
      sseStreams: 0,
    });

    const client = new WebSocket((await server.ready).replace("http", "ws"));
    clients.push(client);
    await new Promise((resolve, reject) => {
      client.once("open", resolve);
      client.once("error", reject);
    });

    await expect.poll(() => server?.stats().ws.connections).toBe(1);
  });
});
