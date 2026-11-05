/**
 * What `courierWSAttach` hands back: the cleanup it always was, carrying the
 * handler's connections, its stop with a deadline of the caller's, and its
 * stats.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { registerSources } from "@noverax/courier";
import { defineApi } from "@noverax/courier/define";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { courierWSAttach } from "../src";

/** The first frame a Courier client sends: `auth`, of protocol version 2. */
const AUTH = JSON.stringify({ type: "auth", v: 2, id: "a0" });

let server: Server | undefined;
const clients: WebSocket[] = [];

beforeEach(() => {
  registerSources({ api: defineApi({ baseURL: "https://upstream.example", endpoints: {} }) });
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

async function attach() {
  server = createServer();
  const attached = courierWSAttach(server);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return { attached, url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/ws` };
}

/** A client, once open, with the code it is closed with. */
async function connect(url: string): Promise<{ closed: Promise<number> }> {
  const client = new WebSocket(url);
  clients.push(client);
  const closed = new Promise<number>((resolve) => client.once("close", resolve));
  await new Promise((resolve, reject) => {
    client.once("open", resolve);
    client.once("error", reject);
  });
  /* Let in, as a Courier client is: its first frame is auth, answered by auth_ok. */
  const admitted = new Promise((resolve) => client.once("message", resolve));
  client.send(AUTH);
  await admitted;
  return { closed };
}

describe("what courierWSAttach hands back", () => {
  it("is the cleanup it was, carrying the handler's connections and its stats", async () => {
    const { attached, url } = await attach();
    await connect(url);

    expect(attached).toBeTypeOf("function");
    expect(attached.connections).toMatchObject({
      broadcast: expect.any(Function),
      disconnect: expect.any(Function),
      requireAuth: expect.any(Function),
    });
    await expect.poll(() => attached.stats().connections).toBe(1);
  });

  it("stops the handler with destroy({ timeoutMs }), the same stop a call to it makes", async () => {
    const { attached, url } = await attach();
    const { closed } = await connect(url);
    await expect.poll(() => attached.stats().connections).toBe(1);

    const stopping = attached.destroy({ timeoutMs: 200 });

    expect(attached()).toBe(stopping);
    await stopping;
    expect(await closed).toBe(1001);
    expect(attached.stats().stopping).toBe(true);
  });
});
