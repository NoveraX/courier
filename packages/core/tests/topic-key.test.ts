import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { courier } from "../src/define/courier";
import type { Subscription } from "../src/realtime/subscription-types";
import { qualifyTopic, unqualifyTopic } from "../src/realtime/ws/topic-key";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";

const { channel } = courier();

describe("qualifyTopic", () => {
  it("qualifies variables the same whether or not an optional field is set to undefined", () => {
    expect(qualifyTopic("api.chat.room", { room: "r2", nick: undefined })).toBe(
      qualifyTopic("api.chat.room", { room: "r2" }),
    );
  });

  it("leaves the base topic alone when every field is undefined", () => {
    expect(qualifyTopic("api.chat.room", { nick: undefined })).toBe("api.chat.room");
  });

  it("qualifies a Date the way JSON sends it", () => {
    const at = new Date("2026-01-02T03:04:05.000Z");

    expect(qualifyTopic("api.log.tail", { at })).toBe(
      qualifyTopic("api.log.tail", { at: at.toISOString() }),
    );
  });

  it("does not read a value holding a separator as two fields", () => {
    expect(qualifyTopic("t", { a: "x,b:y" })).not.toBe(qualifyTopic("t", { a: "x", b: "y" }));
  });

  it("does not read a number and the string of it as the same value", () => {
    expect(qualifyTopic("t", { page: 1 })).not.toBe(qualifyTopic("t", { page: "1" }));
  });

  it("reads the same variables the same whatever the order of their keys", () => {
    expect(qualifyTopic("t", { a: 1, b: [1, { c: 2, d: 3 }] })).toBe(
      qualifyTopic("t", { b: [1, { d: 3, c: 2 }], a: 1 }),
    );
  });

  it("tells apart variables whose JSON once hashed alike", () => {
    expect(qualifyTopic("api.chat.room", { room: "room-12157" })).not.toBe(
      qualifyTopic("api.chat.room", { room: "room-87973" }),
    );
  });

  it("gives every distinct set of variables a topic of its own", () => {
    const sets: unknown[] = [
      { room: "a" },
      { room: "a", page: 1 },
      { room: "a#b" },
      { room: "a", nested: { x: [1, 2] } },
      { room: "a", nested: { x: [2, 1] } },
      { room: ["a"] },
      { room: null },
      { room: true },
      { room: "true" },
      ["room", "a"],
      "room",
      42,
    ];

    const topics = new Set(sets.map((variables) => qualifyTopic("api.chat.room", variables)));

    expect(topics.size).toBe(sets.length);
  });

  it("keeps the endpoint readable from a key that holds a separator", () => {
    const topic = qualifyTopic("api.chat.room", { room: "a#b" });

    expect(unqualifyTopic(topic)).toEqual({ baseTopic: "api.chat.room", key: '{"room":"a#b"}' });
  });
});

describe("a channel whose variables have an optional field set to undefined", () => {
  let served: ServedWS | undefined;

  afterEach(async () => {
    await stopWS(served);
    served = undefined;
  });

  it("hears its welcome and the echo of what it sends", async () => {
    served = await serveWS({
      room: channel
        .variables(z.object({ room: z.string(), nick: z.string().optional() }))
        .send(z.object({ text: z.string() }))
        .response<string>()
        .implement(() => ({
          onJoin: (ctx) => ctx.send("welcome"),
          onMessage: (ctx, message) => ctx.send(`echo ${message.text}`),
        })),
    });
    const ch = executeWSChannel<{ text: string }, string>(served.url, "api.live.room", {
      room: "r2",
      nick: undefined,
    });
    const heard = listen(ch);

    await heard.after(1);
    ch.send({ text: "hi" });
    await heard.after(2);
    /* A refusal, or a message heard twice, would come about when the echo did. */
    await settle(80);
    ch.close();

    expect(heard.errors).toEqual([]);
    expect(heard.data).toEqual(["welcome", "echo hi"]);
  });
});

/* What a channel hears; `after(count)` waits until it has heard `count` messages, or an error, however long the server takes. */
function listen(ch: Subscription<string>) {
  const data: string[] = [];
  const errors: string[] = [];
  let heard = (): void => {};
  ch.on("data", (message) => {
    data.push(message);
    heard();
  });
  ch.on("error", (error) => {
    errors.push(`${error.code} ${error.message}`);
    heard();
  });
  const after = (count: number) =>
    new Promise<void>((resolve) => {
      heard = () => {
        if (data.length >= count || errors.length > 0) resolve();
      };
      heard();
    });
  return { data, errors, after };
}
