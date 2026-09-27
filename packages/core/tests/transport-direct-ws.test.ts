/**
 * Where a direct caller opens a remote channel: the group's prefix, then the
 * path the endpoint addressed, worked out from each call's variables.
 */
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";

import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import { clearWSConnectionPool } from "../src/realtime/caller-ws";

const { channel } = courier();

let wss: WebSocketServer | undefined;
const upgraded: string[] = [];

afterEach(async () => {
  clearWSConnectionPool();
  upgraded.length = 0;
  await new Promise<void>((resolve) => wss?.close(() => resolve()) ?? resolve());
  wss = undefined;
});

/** A remote WebSocket server that records the URL of every upgrade. */
async function recordingServer(): Promise<string> {
  wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  wss.on("connection", (_socket, req) => upgraded.push(req.url ?? ""));
  await once(wss, "listening");
  return `http://127.0.0.1:${(wss.address() as AddressInfo).port}`;
}

function remoteApi(baseURL: string) {
  return defineApi({
    name: "api",
    baseURL,
    groups: {
      rooms: defineGroup({
        prefix: "rooms",
        endpoints: {
          live: channel.variables<{ room: string }>().response<unknown>().connect(":room/live"),
          feed: channel
            .variables<{ room: string }>()
            .response<unknown>()
            .via((ws, v) => ws.connect(`${v.room}/feed`)),
          chat: channel
            .variables<{ room: string }>()
            .send<{ text: string }>()
            .response<unknown>()
            .connect(":room/chat"),
        },
      }),
    },
  });
}

describe("a direct channel call", () => {
  it("fills a path parameter of a push channel from the call's variables", async () => {
    const caller = createCaller(remoteApi(await recordingServer()));

    const subscription = caller.rooms.live({ room: "lobby" });
    await expect.poll(() => upgraded).toEqual(["/rooms/lobby/live"]);
    subscription.close();
  });

  it("follows the path a closure builds from the call's variables", async () => {
    const caller = createCaller(remoteApi(await recordingServer()));

    const subscription = caller.rooms.feed({ room: "lobby" });
    await expect.poll(() => upgraded).toEqual(["/rooms/lobby/feed"]);
    subscription.close();
  });

  it("fills a path parameter of a channel that accepts messages", async () => {
    const caller = createCaller(remoteApi(await recordingServer()));

    const chat = caller.rooms.chat({ room: "lobby" });
    await expect.poll(() => upgraded).toEqual(["/rooms/lobby/chat"]);
    chat.close();
  });
});
