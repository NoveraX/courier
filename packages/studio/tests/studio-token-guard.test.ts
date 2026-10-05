/**
 * What a caller without Studio's token can do: read everything, change
 * nothing. Studio refuses pages of other sites by their Origin, but any
 * process on the machine — another account's, a container's — reaches it
 * without one; every route and page event that changes the project, its
 * mocks, its saved sessions or what the Playground sends asks for the token
 * Studio printed in its terminal.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import { MAX_MESSAGE_BYTES } from "../src/server/max-message-bytes";
import { TOKEN_HEADER, TOKEN_REFUSAL, WRITING_ROUTES } from "../src/server/token-guard";
import type { StudioServer } from "../src/server/types";

const REFUSED = { error: TOKEN_REFUSAL, code: "STUDIO_TOKEN_REQUIRED" };

let root: string;
let url: string;
let studio: StudioServer | undefined;
const sockets: Socket[] = [];

async function start(): Promise<void> {
  url = await new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "courier-token-guard-"));
  writeFileSync(join(root, "courier.config.ts"), "export default { sources: {} };\n");
  await start();
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await studio?.close();
  studio = undefined;
  rmSync(root, { recursive: true, force: true });
});

function token(): string {
  if (!studio) throw new Error("Studio is not running");
  return studio.token;
}

async function post(
  path: string,
  body: unknown,
  presented?: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { "content-type": "application/json", origin: url };
  if (presented !== undefined) headers[TOKEN_HEADER] = presented;
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function page(presented?: string): Promise<Socket> {
  const socket = connect(`${url}/ui`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    auth: presented === undefined ? {} : { token: presented },
  });
  sockets.push(socket);
  await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
  return socket;
}

async function runtime(): Promise<Socket> {
  const socket = connect(`${url}/runtime`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  sockets.push(socket);
  await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
  socket.emit("runtime:hello", { runtimeId: "server", kind: "server" });
  return socket;
}

function replayOf(socket: Socket): Promise<unknown> {
  return new Promise((resolve) => socket.once("events:replay", resolve));
}

describe("a route that changes something", () => {
  it.each([...WRITING_ROUTES])("refuses %s to a caller without the token", async (route) => {
    expect(await post(route, {})).toEqual({ status: 401, body: REFUSED });
  });

  it("refuses a caller whose token is not the project's", async () => {
    const other = token().replace(/^./, (c) => (c === "a" ? "b" : "a"));

    expect(await post("/api/sessions/save", { name: "x", requests: [] }, other)).toEqual({
      status: 401,
      body: REFUSED,
    });
  });

  it("changes nothing for a caller it refused", async () => {
    await post("/api/sessions/save", { name: "Refused", requests: [] });

    expect(await post("/api/sessions/list", {})).toEqual({ status: 200, body: [] });
  });

  it("serves a caller that presents the token", async () => {
    const saved = await post("/api/sessions/save", { name: "Kept", requests: [] }, token());

    expect(saved.status).toBe(200);
    expect((await post("/api/sessions/list", {})).body).toEqual([
      expect.objectContaining({ name: "Kept" }),
    ]);
  });

  it("refuses a caller without the token before reading its body", async () => {
    const response = await fetch(`${url}/api/apis/write`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: url },
      body: JSON.stringify({ padding: "x".repeat(MAX_MESSAGE_BYTES) }),
    });

    expect(response.status).toBe(401);
  });
});

describe("a route that only reads", () => {
  it("serves a caller without the token", async () => {
    expect((await post("/api/sessions/list", {})).status).toBe(200);
    expect((await fetch(`${url}/api/health`, { headers: { origin: url } })).status).toBe(200);
  });
});

describe("a page without the token", () => {
  it("is still sent what Studio shows", async () => {
    const socket = connect(`${url}/ui`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);

    expect(await new Promise((resolve) => socket.once("config:status", resolve))).toEqual(
      expect.objectContaining({ state: expect.any(String) }),
    );
  });

  it("has a mock command answered with the refusal", async () => {
    const socket = await page();

    const reply: unknown = await socket
      .timeout(5_000)
      .emitWithAck("mock:command", { action: "mock:stop", serverId: "api" });

    expect(reply).toEqual({ ok: false, error: TOKEN_REFUSAL });
  });

  it("has a Playground call ended with the refusal", async () => {
    const socket = await page();
    const ended = new Promise((resolve) => socket.once("playground:error", resolve));

    socket.emit("playground:exec", { rid: "call-1", source: "api", method: "list", variables: {} });

    expect(await ended).toEqual({ rid: "call-1", error: { message: TOKEN_REFUSAL } });
  });

  it("is told that Studio did not clear a mock's log", async () => {
    const watching = await page();
    const told = new Promise((resolve) => watching.once("studio:read-only", resolve));

    watching.emit("mock:logs:clear", { serverId: "petstore" });

    expect(await told).toEqual({ event: "mock:logs:clear", error: TOKEN_REFUSAL });
  });

  it("is told that Studio did not clear the log, and the log keeps its requests", async () => {
    const app = await runtime();
    const watching = await page();
    const seen = new Promise((resolve) => watching.once("event", resolve));
    app.emit("event", {
      id: "r1",
      type: "request:start",
      timestamp: Date.now(),
      sessionId: "server",
      source: "api",
      method: "list",
    });
    await seen;
    const told = new Promise((resolve) => watching.once("studio:read-only", resolve));

    watching.emit("requests:clear", { keep: [] });

    expect(await told).toEqual({ event: "requests:clear", error: TOKEN_REFUSAL });
    const next = connect(`${url}/ui`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    sockets.push(next);
    expect(await replayOf(next)).toEqual([expect.objectContaining({ id: "r1" })]);
  });
});

describe("the live traffic", () => {
  it("reaches a page without the token without its credentials, and a page with it whole", async () => {
    const app = await runtime();
    const reader = await page();
    const owner = await page(token());
    const seenByReader = new Promise((resolve) => reader.once("event", resolve));
    const seenByOwner = new Promise((resolve) => owner.once("event", resolve));

    app.emit("event", {
      id: "r1",
      type: "request:start",
      timestamp: Date.now(),
      sessionId: "server",
      source: "api",
      method: "list",
      requestHeaders: { authorization: "Bearer secret", accept: "application/json" },
    });

    expect(await seenByReader).toEqual(
      expect.objectContaining({
        requestHeaders: { authorization: "[redacted]", accept: "application/json" },
      }),
    );
    expect(await seenByOwner).toEqual(
      expect.objectContaining({
        requestHeaders: { authorization: "Bearer secret", accept: "application/json" },
      }),
    );
  });
});

describe("a page with the token", () => {
  it("has the log cleared", async () => {
    const app = await runtime();
    const watching = await page(token());
    const seen = new Promise((resolve) => watching.once("event", resolve));
    app.emit("event", {
      id: "r1",
      type: "request:start",
      timestamp: Date.now(),
      sessionId: "server",
      source: "api",
      method: "list",
    });
    await seen;
    let told = false;
    watching.once("studio:read-only", () => {
      told = true;
    });

    watching.emit("requests:clear", { keep: [] });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const next = connect(`${url}/ui`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    sockets.push(next);
    const replayed = await Promise.race([
      replayOf(next),
      new Promise((resolve) => setTimeout(() => resolve("none"), 300)),
    ]);
    expect(replayed === "none" || (Array.isArray(replayed) && replayed.length === 0)).toBe(true);
    expect(told).toBe(false);
  });
});

describe("the project's token", () => {
  it("is the same for a Studio started again on the project", async () => {
    const first = token();
    await studio?.close();

    await start();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token()).toBe(first);
  });
});
