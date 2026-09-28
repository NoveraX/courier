/**
 * A channel against a real `ws` server running Courier's handler: what it
 * sends before the server has set the subscription up, and a subscription
 * the server keeps under another topic than the client asked for.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { courier } from "../src/define/courier";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";

const { channel } = courier();

let served: ServedWS | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await stopWS(served);
  served = undefined;
});

/** A room whose join takes a while, as one that reads a database does. */
function slowRoom(joinMs: number) {
  return channel
    .variables(z.object({ room: z.string() }))
    .send(z.object({ text: z.string() }))
    .response<string>()
    .implement((variables) => ({
      onJoin: async (ctx) => {
        await settle(joinMs);
        ctx.send(`welcome to ${variables.room}`);
      },
      onMessage: (ctx, message) => ctx.send(`echo ${message.text}`),
    }));
}

function open(url: string, topic: string, variables: unknown) {
  const ch = executeWSChannel<{ text: string }, unknown>(url, topic, variables);
  const data: unknown[] = [];
  const errors: string[] = [];
  ch.on("data", (message) => data.push(message));
  ch.on("error", (error) => errors.push(`${error.code} ${error.message}`));
  return { ch, data, errors };
}

describe("a message sent right after opening a channel", () => {
  it("reaches the channel when the socket is still connecting", async () => {
    served = await serveWS({ room: slowRoom(40) });

    const { ch, data, errors } = open(served.url, "api.live.room", { room: "early" });
    ch.send({ text: "first message" });
    await settle(200);
    ch.close();

    expect(errors).toEqual([]);
    expect(data).toEqual(["welcome to early", "echo first message"]);
  });

  it("reaches the channel when the socket is already open", async () => {
    served = await serveWS({ room: slowRoom(40) });
    const first = open(served.url, "api.live.room", { room: "one" });
    await settle(150);

    const { ch, data, errors } = open(served.url, "api.live.room", { room: "two" });
    ch.send({ text: "second channel first message" });
    ch.send({ text: "and another" });
    await settle(200);
    ch.close();
    first.ch.close();

    expect(errors).toEqual([]);
    expect(data).toEqual([
      "welcome to two",
      "echo second channel first message",
      "echo and another",
    ]);
  });

  it("waits for the channel to rejoin after the socket drops", async () => {
    served = await serveWS({ room: slowRoom(40) });
    const { ch, data, errors } = open(served.url, "api.live.room", { room: "again" });
    await settle(150);
    const statuses: string[] = [];
    const rejoined = new Promise<void>((resolve) => {
      const stop = ch.on("status", (status) => {
        statuses.push(status);
        if (status !== "connected") return;
        stop();
        resolve();
      });
    });

    served.handler.connections.disconnectByMeta(() => true, 1012, "Service restart");
    await settle(20);
    ch.send({ text: "while away" });
    await rejoined;
    await settle(150);
    ch.close();

    expect(statuses).toEqual(["reconnecting", "connecting", "connected"]);

    expect(errors).toEqual([]);
    expect(data).toEqual(["welcome to again", "welcome to again", "echo while away"]);
  });
});

describe("a channel whose variables schema fills in a default", () => {
  it("hears its welcome and the echo of what it sends", async () => {
    served = await serveWS({
      defaults: channel
        .variables(z.object({ room: z.string(), limit: z.number().default(10) }))
        .send(z.object({ text: z.string() }))
        .response<unknown>()
        .implement((variables) => ({
          onJoin: (ctx) => ctx.send({ joined: variables }),
          onMessage: (ctx, message) => ctx.send({ echo: message.text }),
        })),
    });

    const { ch, data, errors } = open(served.url, "api.live.defaults", { room: "r3" });
    ch.send({ text: "hi" });
    await settle(150);
    ch.close();

    expect(errors).toEqual([]);
    expect(data).toEqual([{ joined: { room: "r3", limit: 10 } }, { echo: "hi" }]);
  });

  it("hears what is broadcast to its room by a caller that spelled the default out", async () => {
    served = await serveWS({
      defaults: channel
        .variables(z.object({ room: z.string(), limit: z.number().default(10) }))
        .send(z.object({ text: z.string() }))
        .response<unknown>()
        .implement(() => ({
          onMessage: (ctx, message) => ctx.broadcast(ctx.topic, message.text),
        })),
    });
    /* On sockets of their own: a broadcast leaves out the sender's. */
    const listener = open(`${served.url}?peer=listener`, "api.live.defaults", { room: "r4" });
    const speaker = open(served.url, "api.live.defaults", { room: "r4", limit: 10 });
    await settle(100);

    speaker.ch.send({ text: "to the room" });
    await settle(100);
    listener.ch.close();
    speaker.ch.close();

    expect(listener.errors).toEqual([]);
    expect(speaker.errors).toEqual([]);
    expect(listener.data).toEqual(["to the room"]);
  });
});

describe("what a channel's send answers", () => {
  it("is true for a message that waits for the subscribe or goes out, false once closed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    served = await serveWS({ room: slowRoom(40) });
    const { ch, data } = open(served.url, "api.live.room", { room: "answers" });

    expect(ch.send({ text: "early" })).toBe(true);
    await settle(200);
    expect(ch.send({ text: "open" })).toBe(true);
    await settle(100);
    ch.close();

    expect(ch.send({ text: "late" })).toBe(false);
    expect(data).toEqual(["welcome to answers", "echo early", "echo open"]);
  });
});

