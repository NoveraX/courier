/**
 * What Studio keeps of the requests it has seen.
 *
 * A Studio page that loaded after traffic, or reloaded, showed none of it:
 * the server passed each runtime event on and kept nothing. And a request
 * or stream still open when its runtime went away was never ended — the
 * runtime could no longer say how it ended, so the UI showed it pending
 * forever.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

import { createStudioServer } from "../src/server";

type Event = Record<string, unknown>;

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function project(): string {
  const cache = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, "project-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function freePort(): Promise<number> {
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

async function startStudio(): Promise<string> {
  const port = await freePort();
  return new Promise<string>((resolve) => {
    const server = createStudioServer({ port, host: "127.0.0.1", projectRoot: project(), onReady: resolve });
    cleanups.push(() => server.close());
  });
}

async function open(url: string): Promise<Socket> {
  const socket = connect(url, { transports: ["websocket"], reconnection: false });
  cleanups.push(() => {
    socket.disconnect();
  });
  await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
  return socket;
}

async function runtime(studio: string): Promise<Socket> {
  const socket = await open(`${studio}/runtime`);
  socket.emit("runtime:hello", { runtimeId: "server", kind: "server" });
  return socket;
}

interface WatchingUi {
  socket: Socket;
  events: Event[];
  replays: Event[][];
}

/** A UI that connects, with every event and replay it is sent. */
async function ui(studio: string): Promise<WatchingUi> {
  const socket = connect(`${studio}/ui`, { transports: ["websocket"], reconnection: false });
  cleanups.push(() => {
    socket.disconnect();
  });
  const seen: WatchingUi = { socket, events: [], replays: [] };
  socket.on("event", (event: Event) => seen.events.push(event));
  socket.on("events:replay", (events: Event[]) => seen.replays.push(events));
  await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
  return seen;
}

function event(type: string, fields: Event): Event {
  return { id: String(fields.requestId ?? fields.id), type, timestamp: Date.now(), sessionId: "server", ...fields };
}

describe("a Studio page that connects after traffic", () => {
  it("is sent the requests captured before it connected", async () => {
    const studio = await startStudio();
    const app = await runtime(studio);
    const watching = await ui(studio);
    app.emit("event", event("request:start", { id: "r1", source: "api", method: "list" }));
    app.emit("event", event("request:end", { requestId: "r1", status: 200 }));
    await expect.poll(() => watching.events.length).toBe(2);

    const reloaded = await ui(studio);

    await expect.poll(() => reloaded.replays.length).toBe(1);
    expect(reloaded.replays[0]?.map((e) => e.type)).toEqual(["request:start", "request:end"]);
  });
});

describe("a Studio page that clears its log", () => {
  it("has the requests it did not keep forgotten for the next page", async () => {
    const studio = await startStudio();
    const app = await runtime(studio);
    const watching = await ui(studio);
    for (const id of ["r1", "r2"]) {
      app.emit("event", event("request:start", { id, source: "api", method: "list" }));
    }
    await expect.poll(() => watching.events.length).toBe(2);

    watching.socket.emit("requests:clear", { keep: ["r2"] });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const reloaded = await ui(studio);

    await expect.poll(() => reloaded.replays.length).toBe(1);
    expect(reloaded.replays[0]?.map((e) => e.id)).toEqual(["r2"]);
  });
});

describe("a runtime that goes away", () => {
  it("has its open stream and request ended", async () => {
    const studio = await startStudio();
    const app = await runtime(studio);
    const watching = await ui(studio);
    app.emit("event", event("stream:open", { requestId: "s1", source: "api", method: "ticks", transport: "sse" }));
    app.emit("event", event("request:start", { id: "r1", source: "api", method: "slow" }));
    app.emit("event", event("request:start", { id: "r2", source: "api", method: "list" }));
    app.emit("event", event("request:end", { requestId: "r2", status: 200 }));
    await expect.poll(() => watching.events.length).toBe(4);

    app.disconnect();

    await expect.poll(() => watching.events.length).toBe(6);
    const ended = watching.events.slice(4);
    expect(ended).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "stream:error", requestId: "s1" }),
        expect.objectContaining({ type: "request:error", requestId: "r1" }),
      ]),
    );
  });
});
