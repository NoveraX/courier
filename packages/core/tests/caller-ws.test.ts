import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { courier } from "../src/define/courier";
import { LIMITS } from "../src/limits";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { executeWSPush } from "../src/realtime/ws-subscription";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";

/*
 * Do what `act` does, then let the pool's wait before it closes a socket
 * nobody uses pass at once. What each test checks is what the wait leads
 * to, not how soon a busy machine counts a second; the wait itself is
 * pinned in ws-pool-idle.test.ts.
 */
function passIdleAfter(act: () => void): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldClearNativeTimers: true });
  try {
    act();
    vi.advanceTimersByTime(LIMITS.WS_IDLE_CLOSE_MS);
  } finally {
    vi.useRealTimers();
  }
}

describe("the pooled socket", () => {
  const { channel } = courier();
  let served: ServedWS | undefined;
  let upgrades = 0;
  /** The close code of the first connection the server saw close. */
  let disconnected: Promise<number> = Promise.resolve(0);

  afterEach(async () => {
    vi.useRealTimers();
    await stopWS(served);
    served = undefined;
    upgrades = 0;
  });

  async function serveRoom(): Promise<string> {
    let closed: (code: number) => void = () => undefined;
    disconnected = new Promise((resolve) => {
      closed = resolve;
    });
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
        onDisconnect: ({ code }) => closed(code),
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

    passIdleAfter(() => ch.close());

    /* The one socket there was closed by the client, and none opened after it. */
    expect([await disconnected, upgrades]).toEqual([1000, 1]);
  });

  it("stays open while another channel still uses it", async () => {
    const url = await serveRoom();
    const first = open(url, "a");
    const second = open(url, "b");
    await vi.waitFor(() => expect([first.data, second.data]).toEqual([["welcome"], ["welcome"]]));

    passIdleAfter(() => first.ch.close());
    second.ch.send({ text: "still here" });

    await vi.waitFor(() => expect(second.data).toEqual(["welcome", "echo still here"]));
    expect([upgrades, served?.handler.connections.count]).toEqual([1, 1]);
    second.ch.close();
  });

  it("is kept for a channel opened right after the last one closed", async () => {
    const url = await serveRoom();
    const first = open(url, "a");
    await vi.waitFor(() => expect(first.data).toEqual(["welcome"]));

    let next: ReturnType<typeof open> | undefined;
    passIdleAfter(() => {
      first.ch.close();
      next = open(url, "b");
    });

    await vi.waitFor(() => expect(next?.data).toEqual(["welcome"]));
    expect([upgrades, served?.handler.connections.count]).toEqual([1, 1]);
    next?.ch.close();
  });

  it("closes once a push subscription's reader leaves the loop", async () => {
    const url = await serveRoom();
    const loop = executeWSPush<number>(url, "api.live.ticks")[Symbol.asyncIterator]();
    await loop.next();

    /* What a `break` out of `for await` calls. */
    passIdleAfter(() => void loop.return?.());

    expect([await disconnected, upgrades]).toEqual([1000, 1]);
  });
});
