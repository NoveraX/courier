/**
 * A mock keeps its sockets alive as a Courier server does: it pings each,
 * and closes one whose client stops answering with 4408. A Courier client
 * takes 35 seconds without a frame for a dead server, so a quiet channel on
 * a mock that sent none was dropped and opened again every 35 seconds —
 * on a channel's own path and on the proxy's `/api/ws` alike.
 */
import { decodeMessage, encodeMessage, type WSMessage } from "@noverax/courier/internal";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";

import { createMockServer, type MockServer } from "../src/server/create-mock-server";
import type { PrefixMapping } from "../src/server/prefix-route-types";

const chat: PrefixMapping[] = [
  {
    prefix: "/chat",
    group: "chat",
    methods: ["room"],
    endpoints: [{ name: "room", operation: "custom", path: "", transport: "ws", isChannel: true }],
  },
];

const running: MockServer[] = [];
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  for (const server of running.splice(0)) await server.stop();
});

/** A mock with a chat channel, pinging every 40 ms and waiting 60 ms for the pong. */
async function boot(): Promise<string> {
  const heartbeat = { intervalMs: 40, timeoutMs: 60 };
  const server = createMockServer({
    port: 0,
    log: false,
    admin: false,
    mappings: chat,
    ws: { heartbeat },
  });
  running.push(server);
  server.mock("chat", "room").channel(() => ({ onMessage: () => undefined }));
  const { url } = await server.start();
  return url.replace(/^http/, "ws");
}

/** A socket that answers each ping with a pong, or does not; resolves once open. */
async function connect(
  url: string,
  answers: boolean,
): Promise<{ socket: WebSocket; frames: WSMessage[] }> {
  const socket = new WebSocket(url);
  sockets.push(socket);
  const frames: WSMessage[] = [];
  socket.on("message", (raw) => {
    const frame = decodeMessage(String(raw));
    frames.push(frame);
    if (answers && frame.type === "ping") socket.send(encodeMessage({ type: "pong" }));
  });
  await new Promise((resolve) => socket.once("open", resolve));
  return { socket, frames };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.each([
  ["a channel's own path", "/chat/room"],
  ["the proxy's /api/ws", "/api/ws"],
])("a socket on %s", (_where, path) => {
  it("is pinged, and stays open while its client answers", async () => {
    const { socket, frames } = await connect(`${await boot()}${path}`, true);

    await pause(250);

    expect(frames.filter((frame) => frame.type === "ping").length).toBeGreaterThanOrEqual(3);
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });

  it("is closed with 4408 once its client stops answering", async () => {
    const { socket } = await connect(`${await boot()}${path}`, false);

    const code = await new Promise<number>((resolve) => socket.once("close", resolve));

    expect(code).toBe(4408);
  });
});
