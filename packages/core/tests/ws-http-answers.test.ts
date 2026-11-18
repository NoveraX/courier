/**
 * What a socket over HTTP does with an answer it cannot take. A frame of
 * megabytes comes whole, in whatever pieces the network brings it; one past
 * what the client reads closes the connection with 1009, as a WebSocket's
 * message too big does, the server told and the answer let go of, rather
 * than asked for again and again. An opening whose answer brings no `open`
 * event was not answered — whatever that answer says is not the server's:
 * the socket closes once, and the connection's backoff decides when to try
 * again. One the network cuts once the server has answered it is asked for
 * again, as any answer cut on the way. An answer that is no event stream —
 * a page an entry or another app put there — is no HTTP transport. A
 * refusal stops the connection only when its body names one of the
 * server's own codes, as the server's refusal of an origin does: a
 * gateway's in front of it, in whatever words, is tried again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler, WSHandlerConfig } from "../src/adapter/ws-types";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import type { WSConnectionState } from "../src/realtime/ws/connection-machine-types";
import { createWSConnection } from "../src/realtime/ws/ws-connection";
import type { WSConnection } from "../src/realtime/ws/ws-types";
import { HTTP_MAX_EVENT_LENGTH } from "../src/realtime/ws-http/http-answer";
import { createHTTPSocket } from "../src/realtime/ws-http/http-socket";
import type { HTTPMode, HTTPSocket } from "../src/realtime/ws-http/http-socket-types";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { type EntryWay, entryTo } from "./helpers/http-entry";

const TOPIC = "api.live.room";
const ADDRESS = "ws://localhost/api/ws";
const NOT_ANSWERED = { code: 1006, reason: "The server did not answer the connection's opening" };
const MIB = 1_048_576;
const { channel } = courier();
const api = defineApi({
  expose: true,
  name: "api",
  baseURL: "http://127.0.0.1:1",
  groups: {
    live: defineGroup({
      prefix: "live",
      endpoints: {
        room: channel
          .send<string>()
          .response<string>()
          .implement(() => ({ onMessage: (ctx, message) => ctx.send(`echo:${message}`) })),
      },
    }),
  },
});

const handlers: WSHandler[] = [];
const connections: WSConnection[] = [];
const sockets: HTTPSocket[] = [];

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  registerSources({ api } as never);
});

afterEach(async () => {
  for (const connection of connections.splice(0)) connection.close();
  for (const socket of sockets.splice(0)) socket.close();
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 100 })));
  _resetSourcesForTests();
  vi.restoreAllMocks();
});

function serve(config: WSHandlerConfig = {}): WSHandler {
  const handler = createWSHandler({ heartbeatIntervalMs: 60_000, ...config });
  handlers.push(handler);
  return handler;
}

/** A connection whose sockets go over HTTP through `fetch`, subscribed to the room, and the states it went through. */
function connect(fetch: typeof globalThis.fetch, mode: HTTPMode) {
  const connection = createWSConnection({
    url: ADDRESS,
    socketFactory: (url) => createHTTPSocket(url, { fetch, mode, probeMs: 3000 }),
    backoff: { initialMs: 5, maxMs: 5, jitter: false },
  });
  connections.push(connection);
  const heard: string[] = [];
  const states: WSConnectionState[] = [];
  connection.onStateChange((state) => states.push(state));
  connection.subscribe(TOPIC, { data: (payload) => heard.push(String(payload)) });
  return { connection, heard, states };
}

/** A socket of its own over HTTP, and how it closed. */
function socketThrough(fetch: typeof globalThis.fetch) {
  const socket = createHTTPSocket(ADDRESS, { fetch, mode: "poll", probeMs: 3000 });
  sockets.push(socket);
  const closes: Array<{ code: number; reason: string }> = [];
  socket.onclose = (event) => closes.push({ code: event.code, reason: event.reason });
  return { socket, closes };
}

/* The server's answer let go of, and `answer` given in its place. */
async function inPlaceOf(pass: () => Promise<Response>, answer: Response): Promise<Response> {
  (await pass()).body?.cancel().catch(() => undefined);
  return answer;
}

/*
 * Another app at the socket's path, the server never reached: it answers
 * the first request, and holds any after it, so that a socket that asked
 * again at once would wait rather than ask without end.
 */
function anotherApp(answer: () => Response): EntryWay {
  let asked = 0;
  return async () => (asked++ === 0 ? answer() : new Promise<Response>(() => undefined));
}

const EVENT_STREAM = { "Content-Type": "text/event-stream" };
const encoder = new TextEncoder();

/*
 * An event whose data runs on past `length` characters, no line end ever
 * coming, made as it is read; it ends 16 MiB past, should nothing stop
 * reading it, so that a read never ends only where the test does.
 */
function endlessEvent(length: number) {
  const piece = new Uint8Array(MIB).fill(0x78);
  let sent = 0;
  let left = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("id: 9\ndata: "));
    },
    pull(controller) {
      if (sent > length + 16 * MIB) {
        controller.close();
        return;
      }
      sent += piece.byteLength;
      controller.enqueue(piece);
    },
    cancel() {
      left = true;
    },
  });
  return { body, left: () => left };
}

/* An entry that brings every answer in pieces of `size` bytes, as a network's reads do. */
function inPieces(size: number): EntryWay {
  return async (_head, pass) => {
    const answer = await pass();
    if (answer.body === null) return answer;
    const split = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        for (let at = 0; at < chunk.byteLength; at += size) {
          controller.enqueue(chunk.subarray(at, at + size));
        }
      },
    });
    return new Response(answer.body.pipeThrough(split), {
      status: answer.status,
      headers: answer.headers,
    });
  };
}

/*
 * An entry whose network drops the client's side of the first opening's
 * answer once its first bytes are through, the server's side kept, as a
 * proxy keeps it, until the next request takes the connection on.
 */
function cuttingTheOpening(): EntryWay {
  let cut = false;
  return async (head, pass) => {
    const answer = await pass();
    if (cut || head.token !== undefined || answer.body === null) return answer;
    cut = true;
    const server = answer.body.getReader();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (pulls++ === 0) {
          const { value } = await server.read();
          if (value !== undefined) controller.enqueue(value);
          return;
        }
        await new Promise((resume) => setTimeout(resume, 20));
        controller.error(new TypeError("The network dropped the answer"));
      },
    });
    return new Response(body, { status: answer.status, headers: answer.headers });
  };
}

describe("a socket over HTTP", () => {
  it("takes a frame of megabytes whole, brought in pieces of 16 KiB", async () => {
    const a = serve();
    const { fetch } = entryTo([a], inPieces(16_384));
    const { heard, states } = connect(fetch, "stream");
    await expect.poll(() => states.some((state) => state.phase === "open")).toBe(true);
    const large = "é".repeat(4 * MIB);

    await a.connections.broadcastToTopic(TOPIC, large);

    await expect.poll(() => heard.length, { timeout: 5000 }).toBe(1);
    expect(heard[0] === large).toBe(true);
  });

  it("closes with 1009 on a frame past what it reads, tells the server and lets the answer go, rather than asking for it again", {
    timeout: 20_000,
  }, async () => {
    const ends: number[] = [];
    const a = serve({ onDisconnect: ({ code }) => void ends.push(code) });
    const event = endlessEvent(HTTP_MAX_EVENT_LENGTH);
    let replaced = 0;
    const tooLarge: EntryWay = (head, pass) =>
      head.op === "poll" && head.token !== undefined && replaced++ === 0
        ? inPlaceOf(pass, new Response(event.body, { headers: EVENT_STREAM }))
        : pass();
    const { fetch, log } = entryTo([a], tooLarge);
    const { states } = connect(fetch, "poll");

    await expect.poll(() => ends, { timeout: 15_000 }).toEqual([1009]);
    await expect.poll(() => event.left()).toBe(true);
    expect(states.find((state) => state.phase === "reconnecting")).toMatchObject({
      cause: { kind: "closed", code: 1009 },
    });
    const first = log.heads.find((head) => head.token !== undefined)?.token;
    expect(log.heads.filter((head) => head.token === first && head.op === "poll")).toHaveLength(1);
    expect(log.heads.find((head) => head.op === "close")).toMatchObject({ code: 1009 });
  });

  it.each([
    [
      "ends with no event",
      () => new Response(": a stream of another app's\n\n", { headers: EVENT_STREAM }),
    ],
    [
      "brings another app's events, on a stream that does not end",
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start: (controller) => controller.enqueue(encoder.encode('data: {"tick":1}\n\n')),
          }),
          { headers: EVENT_STREAM },
        ),
    ],
    [
      "closes with another app's code",
      () =>
        new Response('event: close\ndata: {"code":4403,"reason":"Sign in first"}\n\n', {
          headers: EVENT_STREAM,
        }),
    ],
  ])(
    "takes an opening whose answer %s for one not answered: it closes once, and asks no more",
    async (_, answer) => {
      const { fetch, log } = entryTo([serve()], anotherApp(answer));
      const { closes } = socketThrough(fetch);

      await expect.poll(() => closes).toEqual([NOT_ANSWERED]);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(log.heads).toHaveLength(1);
    },
  );

  it("asks again for the opening's stream cut once the server answered it, as for any stream cut on the way", async () => {
    const a = serve();
    const { fetch, log } = entryTo([a], cuttingTheOpening());
    const { heard, states } = connect(fetch, "stream");
    await expect.poll(() => log.heads.some((head) => head.token !== undefined)).toBe(true);

    await expect.poll(() => a.stats().http?.streaming).toBe(1);
    await a.connections.broadcastToTopic(TOPIC, "after the cut");

    await expect.poll(() => heard).toEqual(["after the cut"]);
    expect(states.some((state) => state.phase === "reconnecting")).toBe(false);
    expect(log.heads.filter((head) => head.token === undefined)).toHaveLength(1);
    expect(a.stats().http?.connections).toBe(1);
  });

  it.each([403, 400, 421])(
    "comes back after a refusal of %i that names none of the server's codes, as a gateway's in front of it",
    async (status) => {
      let refused = 0;
      const { fetch } = entryTo([serve()], async (head, pass) => {
        if (head.token !== undefined || refused++ > 0) return pass();
        return Response.json({ message: "Missing Authentication Token" }, { status });
      });
      const { connection, states } = connect(fetch, "poll");

      await expect.poll(() => connection.status).toBe("connected");
      expect(states.map((state) => state.phase)).not.toContain("failed");
      expect(states.find((state) => state.phase === "reconnecting")).toMatchObject({
        cause: {
          kind: "closed",
          code: 1006,
          reason: `The socket's path answered ${status}: Missing Authentication Token`,
        },
      });
    },
  );

  it("fails with 4403 where the server refuses the page's origin, as a socket's connection does", async () => {
    const { fetch: entry } = entryTo([serve({ allowedOrigins: ["https://app.example"] })]);
    const fromAnotherSite: typeof globalThis.fetch = (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("Origin", "https://another.example");
      headers.set("Sec-Fetch-Site", "cross-site");
      return entry(input, { ...init, headers });
    };
    const { connection } = connect(fromAnotherSite, "poll");

    await expect
      .poll(() => connection.state)
      .toMatchObject({
        phase: "failed",
        error: { code: 4403, message: "Origin not allowed" },
      });
  });

  it("takes an answer that is no event stream for no HTTP transport at the socket's path", async () => {
    const page = () =>
      new Response("<!doctype html><title>Sign in</title>\n", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    const { fetch, log } = entryTo([serve()], anotherApp(page));
    const { closes } = socketThrough(fetch);

    await expect
      .poll(() => closes)
      .toEqual([{ code: 1006, reason: "No HTTP transport answers at the socket's path" }]);
    expect(log.heads).toHaveLength(1);
  });
});
