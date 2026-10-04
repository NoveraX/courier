/**
 * Every set of variables is its own topic, end to end: a real `ws` server
 * running Courier's handler, read by Courier's own client and by a bare
 * socket that shows the frames.
 *
 * A topic is qualified by its variables themselves, not by a short hash
 * that two rooms' names can share: a subscriber allowed into its own room
 * never receives the broadcasts of another.
 */
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { z } from "zod";

import { courier } from "../src/define/courier";
import { qualifyTopic } from "../src/realtime/ws/topic-key";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";

const { channel } = courier();

/* Their variables' JSON, `{"room":"room-12157"}` and `{"room":"room-87973"}`,
   has the same 32-bit FNV-1a hash. */
const VICTIM_ROOM = "room-12157";
const OTHER_ROOM = "room-87973";

let served: ServedWS | undefined;
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await stopWS(served);
  served = undefined;
});

const room = channel
  .variables(z.object({ room: z.string() }))
  .send(z.object({ text: z.string() }))
  .response<{ text: string }>()
  .implement(() => ({
    onMessage(ctx, message) {
      void ctx.broadcast(ctx.topic, message);
    },
  }));

/** Join a room over a connection of its own, as another browser would. */
function join(url: string, user: string, roomName: string) {
  const ch = executeWSChannel<{ text: string }, { text: string }>(
    `${url}?user=${user}`,
    "api.live.room",
    { room: roomName },
  );
  const data: { text: string }[] = [];
  ch.on("data", (message) => data.push(message));
  return { ch, data };
}

describe("rooms whose variables once hashed alike", () => {
  it("keep their broadcasts to themselves", async () => {
    served = await serveWS({ room });
    const victim = join(served.url, "victim", VICTIM_ROOM);
    const other = join(served.url, "other", OTHER_ROOM);
    await settle(60);

    victim.ch.send({ text: "for this room only" });
    await settle(60);

    expect(other.data).toEqual([]);
    victim.ch.close();
    other.ch.close();
  });
});

describe("the topic a subscription is known by", () => {
  it("is the one the client asked for, so the server has nothing to rename", async () => {
    served = await serveWS({ room });
    const socket = new WebSocket(served.url);
    sockets.push(socket);
    const frames: { type: string; topic?: string }[] = [];
    socket.on("message", (raw) => frames.push(JSON.parse(String(raw)) as { type: string }));
    await new Promise((resolve) => socket.once("open", resolve));
    const topic = qualifyTopic("api.live.room", { room: VICTIM_ROOM });

    socket.send(
      JSON.stringify({ type: "subscribe", id: "s1", topic, payload: { room: VICTIM_ROOM } }),
    );
    await settle(60);

    expect(frames).toEqual([expect.objectContaining({ type: "subscribed", topic })]);
  });
});
