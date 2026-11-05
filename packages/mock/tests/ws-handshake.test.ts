/**
 * The mock lets a socket in as a Courier server does, by the core's rules:
 * the first frame it sends is `auth_ok`, `auth_error` or `disconnect`, and
 * every close it makes comes right after a frame of the same code, so a
 * Courier client reads a mock's socket as it reads a server's. A mock asks
 * for no credentials, and keeps no history: what an `auth` frame carries
 * only reaches the mocks, and a subscription that resumes is told it may
 * have missed something.
 */
import {
  decodeMessage,
  encodeMessage,
  PROTOCOL_VERSION,
  type WSMessage,
} from "@noverax/courier/internal";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";

import { createMockServer, type MockServer } from "../src/server/create-mock-server";
import type { PrefixMapping } from "../src/server/prefix-route-types";
import { admit } from "./helpers/admit";

const chat: PrefixMapping[] = [
  {
    prefix: "/chat",
    group: "chat",
    methods: ["room"],
    endpoints: [{ name: "room", operation: "custom", path: "", transport: "ws", isChannel: true }],
  },
];

const HEARTBEAT = { intervalMs: 20_000, timeoutMs: 5_000 };

let server: MockServer | undefined;
let stopped = false;

afterEach(async () => {
  if (server && !stopped) await server.stop();
  server = undefined;
  stopped = false;
});

async function boot(): Promise<string> {
  server = createMockServer({
    port: 0,
    log: false,
    admin: false,
    mappings: chat,
    ws: { heartbeat: HEARTBEAT },
  });
  server.mock("chat", "room").channel(() => ({ onMessage: () => undefined }));
  const { url } = await server.start();
  return `${url.replace(/^http/, "ws")}/chat/room`;
}

/** A socket, every frame it hears and how it closed. */
function watched(url: string) {
  const socket = new WebSocket(url);
  const frames: WSMessage[] = [];
  socket.on("message", (raw: Buffer | string) => frames.push(decodeMessage(raw.toString())));
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    socket.once("close", (code, reason) => resolve({ code, reason: reason.toString() })),
  );
  const opened = new Promise<void>((resolve) => socket.once("open", () => resolve()));
  return { socket, frames, closed, opened };
}

describe("a socket's first frame", () => {
  it("is answered with auth_ok: the heartbeat the mock keeps and the limits it holds the client to", async () => {
    const socket = new WebSocket(await boot());

    const answer = await admit(socket);

    expect(answer).toEqual({
      type: "auth_ok",
      id: "a1",
      v: PROTOCOL_VERSION,
      connectionId: expect.stringMatching(/^mock_/),
      heartbeat: HEARTBEAT,
      limits: { maxMessageSize: 65_536, maxSubscriptions: 100 },
    });
    socket.close();
  });

  it.each([
    [
      "an auth of no version: the page is to be loaded again",
      { type: "auth", id: "a1", payload: {} },
      { code: 1002, message: "Protocol version 2 required: reload the page" },
    ],
    [
      "an auth of another version",
      { type: "auth", v: 3, id: "a1", payload: {} },
      { code: 1002, message: "Protocol version 2 is spoken here, not 3" },
    ],
    ["no auth at all", { type: "subscribe", id: "s1", topic: "chat.room" }, { code: 1002 }],
  ])("refuses %s, with auth_error and a close of its code", async (_what, frame, error) => {
    const { socket, frames, closed, opened } = watched(await boot());
    await opened;

    socket.send(JSON.stringify(frame));
    const { code } = await closed;

    expect(frames).toEqual([{ type: "auth_error", error: expect.objectContaining(error), v: 2 }]);
    expect(code).toBe(error.code);
  });

  it("refuses an auth frame no client sends", async () => {
    const { socket, frames, closed, opened } = watched(await boot());
    await opened;

    socket.send(
      encodeMessage({
        type: "auth",
        v: PROTOCOL_VERSION,
        id: "a1",
        payload: { headers: { authorization: 42 } },
      }),
    );
    const { code } = await closed;

    expect(frames).toEqual([
      { type: "auth_error", id: "a1", error: expect.objectContaining({ code }), v: 2 },
    ]);
    expect(code).toBe(4401);
  });

  it("is waited for no longer than a Courier server waits, and its absence said", async () => {
    const { frames, closed } = watched(await boot());

    const { code } = await closed;

    expect(frames).toEqual([
      { type: "auth_error", error: { code: 4408, message: "No auth frame within 3000 ms" }, v: 2 },
    ]);
    expect(code).toBe(4408);
  }, 10_000);
});

describe("a socket let in", () => {
  it("has the credentials it sends again taken, under their id", async () => {
    const socket = new WebSocket(await boot());
    await admit(socket);
    const answer = new Promise<WSMessage>((resolve) =>
      socket.once("message", (raw: Buffer) => resolve(decodeMessage(raw.toString()))),
    );

    socket.send(encodeMessage({ type: "auth", id: "a2", payload: { auth: { token: "t2" } } }));

    expect(await answer).toMatchObject({
      type: "auth_ok",
      id: "a2",
      connectionId: expect.any(String),
    });
    socket.close();
  });

  it("is told its subscription stands at 0, and that a resume may have missed something", async () => {
    const socket = new WebSocket(await boot());
    await admit(socket);
    const answer = new Promise<WSMessage>((resolve) =>
      socket.once("message", (raw: Buffer) => resolve(decodeMessage(raw.toString()))),
    );

    socket.send(
      encodeMessage({
        type: "subscribe",
        id: "s1",
        topic: "chat.room",
        since: { seq: 9, epoch: "e" },
      }),
    );

    expect(await answer).toEqual({
      type: "subscribed",
      id: "s1",
      topic: "chat.room",
      seq: 0,
      epoch: expect.any(String),
      recovered: false,
    });
    socket.close();
  });

  it("is told why it closes when the mock stops, and with the same code", async () => {
    const { socket, frames, closed } = watched(await boot());
    await admit(socket);

    stopped = true;
    await server?.stop();
    const { code } = await closed;

    expect(frames.at(-1)).toEqual({
      type: "disconnect",
      code: 1001,
      reason: "Server shutting down",
      retryAfterMs: 0,
    });
    expect(code).toBe(1001);
  });
});
