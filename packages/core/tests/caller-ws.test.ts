import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { courier } from "../src/define/courier";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { executeWSPush } from "../src/realtime/ws-subscription";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";

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
    await vi.waitFor(() => expect(data).toEqual(["welcome"]));

    ch.close();

    await vi.waitFor(() => expect(served?.handler.connections.count).toBe(0), {
      timeout: IDLE * 2,
    });
  });

  it("stays open while another channel still uses it", async () => {
    const url = await serveRoom();
    const first = open(url, "a");
    const second = open(url, "b");
    await vi.waitFor(() => expect([first.data, second.data]).toEqual([["welcome"], ["welcome"]]));

    first.ch.close();
    await settle(IDLE);
    second.ch.send({ text: "still here" });

    await vi.waitFor(() => expect(second.data).toEqual(["welcome", "echo still here"]));
    expect(served?.handler.connections.count).toBe(1);
    second.ch.close();
  });

  it("is kept for a channel opened right after the last one closed", async () => {
    const url = await serveRoom();
    const first = open(url, "a");
    await vi.waitFor(() => expect(first.data).toEqual(["welcome"]));

    first.ch.close();
    const next = open(url, "b");
    await settle(IDLE);

    await vi.waitFor(() => expect(next.data).toEqual(["welcome"]));
    expect(upgrades).toBe(1);
    expect(served?.handler.connections.count).toBe(1);
    next.ch.close();
  });

  it("closes once a push subscription's reader leaves the loop", async () => {
    const url = await serveRoom();

    for await (const _tick of executeWSPush<number>(url, "api.live.ticks")) break;

    await vi.waitFor(() => expect(served?.handler.connections.count).toBe(0), {
      timeout: IDLE * 2,
    });
  });
});
