/**
 * Two replicas sharing a pub/sub bus, each a real `ws` server running
 * Courier's handler. What application code broadcasts through one replica's
 * connection registry reaches the clients of both.
 */
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { z } from "zod";

import { courier } from "../src/define/courier";
import { qualifyTopic } from "../src/realtime/ws/topic-key";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { createSharedBus } from "./helpers/shared-pubsub";
import { type ServedWS, serveWS, settle, stopWS, subscribers } from "./helpers/ws-server";

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
    await expect.poll(() => [subscribers(a), subscribers(b)], { timeout: 2000 }).toEqual([1, 1]);

    await a.handler.connections.broadcastToTopic(
      qualifyTopic("api.live.room", { room: "r1" }),
      "hi",
    );

    await expect.poll(() => [onA, onB], { timeout: 2000 }).toEqual([["hi"], ["hi"]]);
    /* Once each: a copy the bus brought back would come right behind the first. */
    await settle(50);
    expect([onA, onB]).toEqual([["hi"], ["hi"]]);
  });

  it("reaches every room of the endpoint on every replica", async () => {
    const [a, b] = await twoReplicas();
    const r1OnA = join(a.url, "r1");
    const r2OnB = join(b.url, "r2");
    await expect.poll(() => [subscribers(a), subscribers(b)], { timeout: 2000 }).toEqual([1, 1]);

    await a.handler.connections.broadcastToBaseTopic("api.live.room", "to all rooms");

    await expect
      .poll(() => [r1OnA, r2OnB], { timeout: 2000 })
      .toEqual([["to all rooms"], ["to all rooms"]]);
  });

  it("reaches every connection on every replica", async () => {
    const [a, b] = await twoReplicas();
    const frames: unknown[] = [];
    const raw = new WebSocket(b.url);
    raw.on("message", (data) => frames.push(JSON.parse(String(data))));
    /* Counted by the replica, the socket is open: what it sends now follows the handshake. */
    await expect.poll(() => b.handler.connections.count, { timeout: 2000 }).toBe(1);

    await a.handler.connections.broadcast({ announcement: "maintenance" });

    await expect
      .poll(() => frames, { timeout: 2000 })
      .toContainEqual(
        expect.objectContaining({ type: "data", payload: { announcement: "maintenance" } }),
      );
    raw.close();
  });
});
