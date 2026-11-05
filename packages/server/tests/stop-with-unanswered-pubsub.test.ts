/**
 * A standalone server stopping while its pub/sub adapter never answers —
 * Redis away, its commands queued: its WebSocket clients are told to
 * reconnect before the HTTP server closes, and the stop settles within its
 * deadline rather than waiting on the adapter.
 */
import { courier, defineApi } from "@noverax/courier/define";
import type { PubSubAdapter } from "@noverax/courier/realtime";
import { createMemoryBus } from "@noverax/courier/realtime";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { createCourierServer } from "../src/create-server";
import type { CourierServer } from "../src/types";

const { channel } = courier();
const feed = channel.response<string>().implement(async function* () {
  yield "hello";
  await new Promise(() => {});
});

let server: CourierServer | undefined;
const clients: WebSocket[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate();
  await server?.stop();
  server = undefined;
});

/** An adapter whose subscriptions never settle. */
function unanswered(): PubSubAdapter {
  return { ...createMemoryBus().replica("away"), subscribe: () => new Promise(() => undefined) };
}

describe("a standalone server stopping while its pub/sub adapter never answers", () => {
  it("closes its WebSocket clients with 1001 and settles within its deadline", async () => {
    const live = defineApi({ expose: true, baseURL: "http://127.0.0.1:1", endpoints: { feed } });
    server = createCourierServer({
      sources: { live },
      port: 0,
      host: "127.0.0.1",
      signals: false,
      pubsub: unanswered(),
    });
    const client = new WebSocket((await server.ready).replace("http", "ws"));
    clients.push(client);
    await new Promise((resolve, reject) => {
      client.once("open", resolve);
      client.once("error", reject);
    });
    client.send(JSON.stringify({ type: "auth", v: 2, id: "a0" }));
    const closed = new Promise<number>((resolve) => client.once("close", resolve));
    await expect.poll(() => server?.wsConnections.count).toBe(1);

    const started = Date.now();
    await server.stop();

    expect(await closed).toBe(1001);
    /* The deadline of the drain is 5 s; a stop that waited on the adapter would never come. */
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
