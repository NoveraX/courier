import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { courier } from "../src/define/courier";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { hashVariables, qualifyTopic } from "../src/realtime/ws/topic-hash";
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
    expect(hashVariables({ a: "x,b:y" })).not.toBe(hashVariables({ a: "x", b: "y" }));
  });

  it("does not read a number and the string of it as the same value", () => {
    expect(hashVariables({ page: 1 })).not.toBe(hashVariables({ page: "1" }));
  });

  it("reads the same variables the same whatever the order of their keys", () => {
    expect(hashVariables({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(
      hashVariables({ b: [1, { d: 3, c: 2 }], a: 1 }),
    );
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
    const data: string[] = [];
    const errors: string[] = [];
    ch.on("data", (message) => data.push(message));
    ch.on("error", (error) => errors.push(`${error.code} ${error.message}`));
    await settle(80);

    ch.send({ text: "hi" });
    await settle(80);
    ch.close();

    expect(errors).toEqual([]);
    expect(data).toEqual(["welcome", "echo hi"]);
  });
});
