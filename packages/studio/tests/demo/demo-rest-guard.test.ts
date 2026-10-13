/**
 * A public demo works on two of its visitors' large API requests at once —
 * a specification read, its code generated, a log exported — and on one at
 * a time from each address; the page's everyday requests, a few bytes each,
 * are counted by their rate alone. A large request counts for as long as the
 * work it set going runs: a visitor who sends one and hangs up at once stops
 * nothing by itself, so its place is free only once that work has ended —
 * which the hang-up tells the work to do. A visitor that goes quiet on its
 * turn — a body that stops arriving, an answer never read, compressed or
 * not — is dropped, and keeps no place; one answered before its body was
 * read keeps the server's keep-alive timeout.
 */
import { randomBytes } from "node:crypto";
import { createServer, request, type Server } from "node:http";
import { type AddressInfo, connect, type Socket } from "node:net";
import compression from "compression";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoLimits } from "../../src/server/demo/demo-limits";
import {
  DEMO_LARGE_BODY,
  DEMO_REST_ADDRESS_BUSY,
  DEMO_REST_BUSY,
  DEMO_REST_IN_FLIGHT,
  demoRestGuard,
} from "../../src/server/demo/demo-rest-guard";
import { trustedProxies } from "../../src/server/demo/trusted-proxies";
import { requestWork } from "../../src/server/request-work";
import { studioApp } from "../../src/server/studio-app";
import type { StudioToken } from "../../src/server/studio-token";

const TOKEN: StudioToken = {
  value: "t".repeat(43),
  matches: (presented) => presented === "t".repeat(43),
};

/* How long a visitor may stay quiet on its turn, here: short enough to wait out. */
const IDLE_MS = 300;

/* An answer far larger than the connection's buffers hold for a visitor that does not read. */
const LARGE = 64 * 1024 * 1024;

/* A body past the size the demo counts while it runs: a specification pasted in. */
const LARGE_BODY = JSON.stringify({ pad: "x".repeat(DEMO_LARGE_BODY) });

let server: Server | undefined;
const sockets: Socket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  server?.closeAllConnections();
  await new Promise((resolve) => server?.close(resolve));
  server = undefined;
});

/* A demo behind a proxy on this machine, so each test visitor has an address of its own. */
async function demo({ compressed = false } = {}): Promise<{
  port: number;
  finish: () => void;
  aborted: () => number;
}> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let aborted = 0;
  const app = studioApp();
  if (compressed) app.use(compression());
  app.use("/api", demoRestGuard(TOKEN, createDemoLimits(), trustedProxies(["127.0.0.1"]), IDLE_MS));
  /* Answered before its body is read, as Studio refuses a request without the token. */
  app.post("/api/refuse", (_req, res) => {
    res.status(401).json({ error: "refused" });
  });
  app.use("/api", express.json({ limit: "2mb" }));
  app.post("/api/work", async (_req, res) => {
    const work = requestWork(res);
    work.signal.addEventListener("abort", () => aborted++);
    await work.hold(released);
    if (!work.signal.aborted) res.json({ done: true });
  });
  for (const register of [app.get.bind(app), app.post.bind(app)])
    register("/api/quick", (_req, res) => {
      res.json({ done: true });
    });
  app.post("/api/large", (_req, res) => {
    res.setHeader("content-type", "text/plain");
    /* Random, so that compression shrinks it no more than a little. */
    res.end(compressed ? randomBytes(LARGE) : Buffer.alloc(LARGE, 0x61));
  });
  server = createServer(app);
  server.keepAliveTimeout = 200;
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    finish: release,
    aborted: () => aborted,
  };
}

function hangUpAfterSending(port: number, visitor: string): Promise<void> {
  return new Promise((resolve) => {
    const sent = request({
      host: "127.0.0.1",
      port,
      path: "/api/work",
      method: "POST",
      headers: { "x-forwarded-for": visitor, "content-type": "application/json" },
    });
    sent.on("error", () => {});
    sent.end(LARGE_BODY, () =>
      setTimeout(() => {
        sent.destroy();
        resolve();
      }, 50),
    );
  });
}

function post(
  port: number,
  path: string,
  visitor: string,
  { headers = {}, body = LARGE_BODY }: { headers?: Record<string, string>; body?: string } = {},
): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "x-forwarded-for": visitor, ...headers },
  });
}

/* A request written by hand, which the test then leaves as it likes: unread, or its body unfinished. */
function raw(
  port: number,
  path: string,
  visitor: string,
  body: string,
  { length = Buffer.byteLength(body), method = "POST", headers = "" } = {},
): Socket {
  const socket = connect(port, "127.0.0.1");
  socket.on("error", () => {});
  socket.write(
    `${method} ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Forwarded-For: ${visitor}\r\n${headers}` +
      `Content-Type: application/json\r\nContent-Length: ${length}\r\n\r\n${body}`,
  );
  sockets.push(socket);
  return socket;
}

/* Ask until the demo takes the request: a visitor that reads nothing never sees its connection dropped. */
async function admittedWithin(ms: number, ask: () => Promise<Response>): Promise<number> {
  const until = Date.now() + ms;
  for (;;) {
    const { status } = await ask();
    if (status !== 429 || Date.now() > until) return status;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function closes(socket: Socket, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    socket.once("close", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

describe("a demo's visitors' large requests at work", () => {
  it("keep their places while the work they set going runs, though their visitors hung up", async () => {
    const { port, finish, aborted } = await demo();
    for (let n = 0; n < DEMO_REST_IN_FLIGHT; n++) await hangUpAfterSending(port, `203.0.113.${n}`);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const turnedAway = await post(port, "/api/quick", "203.0.113.99");
    finish();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(turnedAway.status).toBe(429);
    expect(await turnedAway.json()).toEqual({ error: DEMO_REST_BUSY, code: "STUDIO_DEMO_BUSY" });
    expect(aborted()).toBe(DEMO_REST_IN_FLIGHT);
    expect((await post(port, "/api/quick", "203.0.113.99")).status).toBe(200);
  });

  it("leave the host's requests uncounted", async () => {
    const { port, finish } = await demo();
    for (let n = 0; n < DEMO_REST_IN_FLIGHT; n++) await hangUpAfterSending(port, `203.0.113.${n}`);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const host = await post(port, "/api/quick", "203.0.113.99", {
      headers: { "x-courier-studio-token": TOKEN.value },
    });
    finish();

    expect(host.status).toBe(200);
  });

  it("number one at a time from each address", async () => {
    const { port, finish } = await demo();
    await hangUpAfterSending(port, "203.0.113.1");

    const same = await post(port, "/api/quick", "203.0.113.1");
    const other = await post(port, "/api/quick", "203.0.113.2");
    finish();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(same.status).toBe(429);
    expect(await same.json()).toEqual({ error: DEMO_REST_ADDRESS_BUSY, code: "STUDIO_DEMO_BUSY" });
    expect(other.status).toBe(200);
    expect((await post(port, "/api/quick", "203.0.113.1")).status).toBe(200);
  });
});

describe("a demo's visitors' everyday requests", () => {
  it("are answered while large ones hold every place, several at once from one page", async () => {
    const { port, finish } = await demo();
    for (let n = 0; n < DEMO_REST_IN_FLIGHT; n++) await hangUpAfterSending(port, `203.0.113.${n}`);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const page = await Promise.all(
      Array.from({ length: 5 }, () => post(port, "/api/quick", "203.0.113.50", { body: "{}" })),
    );
    finish();

    expect(page.map((answer) => answer.status)).toEqual([200, 200, 200, 200, 200]);
  });

  it("count toward the rate whatever their method, when they send a body", async () => {
    const { port } = await demo();
    const answers: string[] = [];

    for (let n = 0; n < 40; n++) {
      const socket = raw(port, "/api/quick", "203.0.113.60", "{}", { method: "GET" });
      answers.push(
        await new Promise<string>((resolve) =>
          socket.once("data", (data) => resolve(String(data))),
        ),
      );
    }

    expect(answers.some((answer) => answer.startsWith("HTTP/1.1 429"))).toBe(true);
  });
});

describe("a demo's visitor that goes quiet on its turn", () => {
  it("frees every visitor's place once its answer is written, read or not", async () => {
    const { port, finish } = await demo();
    const reader = raw(port, "/api/large", "203.0.113.1", LARGE_BODY);
    reader.pause();
    await hangUpAfterSending(port, "203.0.113.2");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const third = await post(port, "/api/quick", "203.0.113.3");
    finish();

    expect(third.status).toBe(200);
  });

  it("keeps its address's place until the answer it does not read is dropped", async () => {
    const { port } = await demo();
    const reader = raw(port, "/api/large", "203.0.113.1", LARGE_BODY);
    reader.pause();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const whileUnread = await post(port, "/api/quick", "203.0.113.1");
    const afterDropped = await admittedWithin(IDLE_MS * 10, () =>
      post(port, "/api/quick", "203.0.113.1"),
    );

    expect(whileUnread.status).toBe(429);
    expect(afterDropped).toBe(200);
  });

  it("is dropped when it stops reading a compressed answer, and keeps no place", async () => {
    const { port } = await demo({ compressed: true });
    const reader = raw(port, "/api/large", "203.0.113.1", LARGE_BODY, {
      headers: "Accept-Encoding: gzip\r\n",
    });
    reader.pause();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const whileUnread = await post(port, "/api/quick", "203.0.113.1");
    const afterDropped = await admittedWithin(IDLE_MS * 10, () =>
      post(port, "/api/quick", "203.0.113.1"),
    );

    expect(whileUnread.status).toBe(429);
    expect(afterDropped).toBe(200);
    expect(reader.readableLength + reader.bytesRead).toBeLessThan(LARGE);
  });

  it("is dropped once its body stops arriving, and keeps no place", async () => {
    const { port } = await demo();
    const length = DEMO_LARGE_BODY + 1000;
    const stalled = [
      raw(port, "/api/quick", "203.0.113.1", '{"source":"raw","content":"', { length }),
      raw(port, "/api/quick", "203.0.113.2", '{"source":"raw","content":"', { length }),
    ];
    await new Promise((resolve) => setTimeout(resolve, 100));
    const whileStalled = await post(port, "/api/quick", "203.0.113.3");

    const afterDropped = await admittedWithin(IDLE_MS * 10, () =>
      post(port, "/api/quick", "203.0.113.3"),
    );

    expect(stalled.length).toBe(DEMO_REST_IN_FLIGHT);
    expect(whileStalled.status).toBe(429);
    expect(afterDropped).toBe(200);
  });

  it("keeps the server's keep-alive timeout once it is answered before its body is read", async () => {
    const { port } = await demo();
    const refused = raw(port, "/api/refuse", "203.0.113.7", "{}");
    refused.resume();

    expect(await closes(refused, 3000)).toBe(true);
  });
});
