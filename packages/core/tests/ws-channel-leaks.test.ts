/**
 * Channels that come and go on a shared socket leave nothing behind on it:
 * every status listener and topic subscription a channel takes is given
 * back when it closes, when the server ends it, and across `reconnect()`.
 * Counted on the socket's connection before and after, on a real server.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { courier } from "../src/define/courier";
import { acquireConnection, type ConnectionLease } from "../src/realtime/caller-ws";
import type { WSConnectionConfig } from "../src/realtime/ws/ws-types";
import { executeWSChannel } from "../src/realtime/ws-channel-client";
import { type ServedWS, serveWS, stopWS } from "./helpers/ws-server";

const { channel } = courier();

let served: ServedWS | undefined;
let lease: ConnectionLease | undefined;

afterEach(async () => {
  lease?.release();
  lease = undefined;
  await stopWS(served);
  served = undefined;
});

/* The socket a set of channels shares, its listeners and subscriptions counted as they are taken and given back. */
function counted(url: string, config: Partial<WSConnectionConfig>) {
  lease = acquireConnection(url, config);
  const conn = lease.connection;
  const live = { statusListeners: 0, subscriptions: 0 };
  const onStatusChange = conn.onStatusChange.bind(conn);
  conn.onStatusChange = (handler) => {
    live.statusListeners++;
    const off = onStatusChange(handler);
    return () => {
      live.statusListeners--;
      off();
    };
  };
  const subscribe = conn.subscribe.bind(conn);
  conn.subscribe = (topic, subscriber, variables) => {
    live.subscriptions++;
    const off = subscribe(topic, subscriber, variables);
    return () => {
      live.subscriptions--;
      off();
    };
  };
  return live;
}

const room = channel
  .variables(z.object({ room: z.string() }))
  .send<string>()
  .response<string>()
  .implement(() => ({
    onJoin: (ctx) => {
      if (ctx.variables.room === "closing") ctx.close(1000);
    },
    onMessage: () => undefined,
  }));

describe("channels on a shared socket", () => {
  it("give back everything they took when they close, however many came and went", async () => {
    /* Room for the subscribes and unsubscribes of 200 channels in a second. */
    served = await serveWS({ room }, { maxSubscriptionsPerConnection: 1000 });
    const config = {};
    const live = counted(served.url, config);

    for (let i = 0; i < 200; i++) {
      const ch = executeWSChannel(served.url, "api.live.room", { room: `r${i % 7}` }, config);
      if (i % 20 === 0) await vi.waitFor(() => expect(ch.status).toBe("connected"));
      ch.close();
    }

    expect(live).toEqual({ statusListeners: 0, subscriptions: 0 });
  });

  it("give back what they took when the server ends them", async () => {
    served = await serveWS({ room });
    const config = {};
    const live = counted(served.url, config);

    const ended = Array.from({ length: 20 }, () =>
      executeWSChannel(served?.url ?? "", "api.live.room", { room: "closing" }, config),
    );

    await vi.waitFor(() => expect(ended.every((ch) => ch.status === "disconnected")).toBe(true));
    expect(live).toEqual({ statusListeners: 0, subscriptions: 0 });
  });

  it("hold one of each across reconnect(), however often they reconnect", async () => {
    served = await serveWS({ room });
    const config = {};
    const live = counted(served.url, config);
    const ch = executeWSChannel(served.url, "api.live.room", { room: "a" }, config);
    await vi.waitFor(() => expect(ch.status).toBe("connected"));

    for (let i = 0; i < 20; i++) {
      ch.reconnect();
      await vi.waitFor(() => expect(ch.status).toBe("connected"));
    }

    expect(live).toEqual({ statusListeners: 1, subscriptions: 1 });
    ch.close();
    expect(live).toEqual({ statusListeners: 0, subscriptions: 0 });
  });
});
