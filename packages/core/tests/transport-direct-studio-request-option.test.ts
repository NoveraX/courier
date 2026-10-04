/**
 * The row a stream a client opens is shown under in Studio: the one Studio
 * names when it opens the stream itself — a replay, a Playground run — so
 * it can follow it, and a fresh one for every stream an application opens.
 */
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";

import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import { clearWSConnectionPool } from "../src/realtime/caller-ws";
import type { StudioHooks } from "../src/studio/hooks";
import { directStreamingFactories } from "../src/transport/direct-streaming";

const { channel, stream } = courier();

const HOOKS_KEY = Symbol.for("courier.studio.hooks");
const hooks = (globalThis as Record<symbol, unknown>)[HOOKS_KEY] as StudioHooks;

let server: Server | undefined;
let wss: WebSocketServer | undefined;

afterEach(async () => {
  delete hooks.onStreamOpen;
  clearWSConnectionPool();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  await new Promise<void>((resolve) => wss?.close(() => resolve()) ?? resolve());
  server = undefined;
  wss = undefined;
});

async function sseServer(): Promise<string> {
  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify("hello")}\n\n`);
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function wsServer(): Promise<string> {
  wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
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
          events: stream.response<string>().get("events"),
          live: channel.response<unknown>().connect("live"),
          chat: channel.send<{ text: string }>().response<unknown>().connect("chat"),
        },
      }),
    },
  });
}

/* The rows streams opened under: an SSE stream tells its row again once its
   response's headers arrive, under the same id. */
function watchRows(): Set<string> {
  const rows = new Set<string>();
  hooks.onStreamOpen = (event) => {
    rows.add(event.requestId);
  };
  return rows;
}

describe("a stream a client opens", () => {
  it("is shown under the row Studio names for it", async () => {
    const rows = watchRows();
    const streams = directStreamingFactories(remoteApi(await sseServer()), {});

    const feed = streams.sse("rooms", "events", {}, { studioRequestId: "pg_replay-row-1" });
    for await (const _event of feed) break;

    expect([...rows]).toEqual(["pg_replay-row-1"]);
  });

  it("is given a fresh row when nothing names one", async () => {
    const rows = watchRows();
    const streams = directStreamingFactories(remoteApi(await sseServer()), {});

    for await (const _event of streams.sse("rooms", "events", {}, {})) break;

    const [row, ...others] = rows;
    expect(others).toEqual([]);
    expect(row).toBeTruthy();
    expect(row).not.toBe("pg_replay-row-1");
  });
});

describe("a channel or a push a client opens", () => {
  it("is shown under the row Studio names for it", async () => {
    const rows = watchRows();
    const streams = directStreamingFactories(remoteApi(await wsServer()), {});

    const chat = streams.wsChannel("rooms", "chat", {}, { studioRequestId: "pg_replay-row-2" });
    const live = streams.wsPush("rooms", "live", {}, { studioRequestId: "pg_replay-row-3" });
    await vi.waitFor(() => expect(rows.size).toBe(2));
    chat.close();
    live.close();

    expect([...rows].sort()).toEqual(["pg_replay-row-2", "pg_replay-row-3"]);
  });
});
