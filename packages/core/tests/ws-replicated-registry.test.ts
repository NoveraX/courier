/**
 * Two replicas sharing a pub/sub bus, each a real `ws` server running
 * Courier's handler. What application code broadcasts through one replica's
 * connection registry reaches the clients of both.
 */
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { z } from "zod";

import { courier } from "../src/define/courier";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { qualifyTopic } from "../src/realtime/ws/topic-hash";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";
import { createSharedBus } from "./helpers/shared-pubsub";

const { channel } = courier();
const endpoints = {
  room: channel
    .variables(z.object({ room: z.string() }))
    .send(z.object({ text: z.string() }))
    .response<string>()
    .implement(() => ({ onMessage: () => undefined })),
};

let replicas: ServedWS[] = [];

afterEach(async () => {
  for (const replica of replicas) await stopWS(replica);
  replicas = [];
});

async function twoReplicas(): Promise<[ServedWS, ServedWS]> {
  const bus = createSharedBus();
  const a = await serveWS(endpoints, { pubsub: bus("replica-a") });
  const b = await serveWS(endpoints, { pubsub: bus("replica-b") });
  replicas = [a, b];
  return [a, b];
}

function join(url: string, room: string): string[] {
  const received: string[] = [];
  executeWSChannel<{ text: string }, string>(url, "api.live.room", { room }).on("data", (data) =>
    received.push(data),
  );
  return received;
}

describe("a broadcast through one replica's connection registry", () => {
  it("reaches the room's clients on every replica, once each", async () => {
    const [a, b] = await twoReplicas();
    const onA = join(a.url, "r1");
    const onB = join(b.url, "r1");
    await settle(100);

    await a.handler.connections.broadcastToTopic(qualifyTopic("api.live.room", { room: "r1" }), "hi");
    await settle(50);

    expect(onA).toEqual(["hi"]);
    expect(onB).toEqual(["hi"]);
  });

  it("reaches every room of the endpoint on every replica", async () => {
    const [a, b] = await twoReplicas();
    const r1OnA = join(a.url, "r1");
    const r2OnB = join(b.url, "r2");
    await settle(100);

    await a.handler.connections.broadcastToBaseTopic("api.live.room", "to all rooms");
    await settle(50);

    expect(r1OnA).toEqual(["to all rooms"]);
    expect(r2OnB).toEqual(["to all rooms"]);
  });

  it("reaches every connection on every replica", async () => {
    const [a, b] = await twoReplicas();
    const frames: unknown[] = [];
    const raw = new WebSocket(b.url);
    raw.on("message", (data) => frames.push(JSON.parse(String(data))));
    await new Promise((resolve) => raw.once("open", resolve));
    await settle(50);

    await a.handler.connections.broadcast({ announcement: "maintenance" });
    await settle(50);
    raw.close();

    expect(frames).toContainEqual(
      expect.objectContaining({ type: "data", payload: { announcement: "maintenance" } }),
    );
  });
});
