import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { courier } from "../src/define/courier";
import { buildDirectWSUrl, buildWSTopic } from "../src/realtime/caller-ws";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { executeWSPush } from "../src/realtime/ws-subscription";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";

describe("buildDirectWSUrl", () => {
  it("converts http to ws and builds path", () => {
    expect(buildDirectWSUrl("http://localhost:3000", "chat", "room")).toBe(
      "ws://localhost:3000/chat/room",
    );
  });

  it("converts https to wss", () => {
    expect(buildDirectWSUrl("https://api.example.com", "notifications", "feed")).toBe(
      "wss://api.example.com/notifications/feed",
    );
  });

  it("strips trailing slash from baseURL", () => {
    expect(buildDirectWSUrl("http://localhost:3000/", "chat", "room")).toBe(
      "ws://localhost:3000/chat/room",
    );
  });

  it("handles empty prefix", () => {
    expect(buildDirectWSUrl("http://localhost:3000", "", "health")).toBe(
      "ws://localhost:3000/health",
    );
  });

  it("strips leading slash from prefix", () => {
    expect(buildDirectWSUrl("http://localhost:3000", "/chat", "room")).toBe(
      "ws://localhost:3000/chat/room",
    );
  });
});

describe("buildWSTopic", () => {
  it("builds topic with group", () => {
    expect(buildWSTopic("api", "chat", "room")).toBe("api.chat.room");
  });

  it("builds topic without group", () => {
    expect(buildWSTopic("api", "", "health")).toBe("api.health");
  });
});

describe("the pooled socket", () => {
  const { channel } = courier();
  /** Longer than a pooled socket with nothing on it is kept open. */
  const IDLE = 1_300;
  let served: ServedWS | undefined;
  let upgrades = 0;

  afterEach(async () => {
    await stopWS(served);
    served = undefined;
    upgrades = 0;
  });

  async function serveRoom(): Promise<string> {
    served = await serveWS(
      {
        room: channel
          .variables(z.object({ room: z.string() }))
          .send(z.object({ text: z.string() }))
          .response<string>()
          .implement(() => ({
            onJoin: (ctx) => ctx.send("welcome"),
            onMessage: (ctx, message) => ctx.send(`echo ${message.text}`),
          })),
        ticks: channel.response<number>().implement(async function* () {
          for (let i = 0; ; i++) {
            yield i;
            await settle(10);
          }
        }),
      },
      {
        onConnect: () => {
          upgrades++;
          return {};
        },
      },
    );
    return served.url;
  }

  function open(url: string, room: string) {
    const ch = executeWSChannel<{ text: string }, string>(url, "api.live.room", { room });
    const data: string[] = [];
    ch.on("data", (message) => data.push(message));
    return { ch, data };
  }

  it("closes once its last channel has closed", async () => {
    const url = await serveRoom();
    const { ch, data } = open(url, "a");
    await settle(100);

    ch.close();
    await settle(IDLE);

    expect(data).toEqual(["welcome"]);
    expect(served?.handler.connections.count).toBe(0);
  });

  it("stays open while another channel still uses it", async () => {
    const url = await serveRoom();
    const first = open(url, "a");
    const second = open(url, "b");
    await settle(100);

    first.ch.close();
    await settle(IDLE);
    second.ch.send({ text: "still here" });
    await settle(100);

    expect(served?.handler.connections.count).toBe(1);
    expect(second.data).toEqual(["welcome", "echo still here"]);
    second.ch.close();
  });

  it("is kept for a channel opened right after the last one closed", async () => {
    const url = await serveRoom();
    const first = open(url, "a");
    await settle(100);

    first.ch.close();
    const next = open(url, "b");
    await settle(IDLE);

    expect(next.data).toEqual(["welcome"]);
    expect(upgrades).toBe(1);
    expect(served?.handler.connections.count).toBe(1);
    next.ch.close();
  });

  it("closes once a push subscription's reader leaves the loop", async () => {
    const url = await serveRoom();

    for await (const _tick of executeWSPush<number>(url, "api.live.ticks")) break;
    await settle(IDLE);

    expect(served?.handler.connections.count).toBe(0);
  });
});
