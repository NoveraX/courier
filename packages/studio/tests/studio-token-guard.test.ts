/**
 * What a caller without Studio's token can do: read everything, change
 * nothing. Studio refuses pages of other sites by their Origin, but any
 * process on the machine — another account's, a container's — reaches it
 * without one; every route and page event that changes the project, its
 * mocks, its saved sessions or what the Playground sends asks for the token
 * Studio printed in its terminal.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import { MAX_MESSAGE_BYTES } from "../src/server/max-message-bytes";
import { OPEN_ROUTES, TOKEN_HEADER, TOKEN_REFUSAL } from "../src/server/token-guard";
import type { StudioServer } from "../src/server/types";
import { registeredApiRoutes } from "./helpers/api-routes";
import { replayed, sendRuntimeEvents } from "./helpers/runtime-events";

const REFUSED = { error: TOKEN_REFUSAL, code: "STUDIO_TOKEN_REQUIRED" };
const TOKEN_ROUTES = registeredApiRoutes().filter((route) => !OPEN_ROUTES.has(route));

/* Each open route's own answer to a caller without the token, sent `{}` — a GET for the health check. */
const OPEN_ANSWERS: ReadonlyArray<readonly [route: string, status: number]> = [
  ["/api/health", 200],
  ["/api/apis/parse", 400],
  ["/api/apis/generate", 400],
  ["/api/apis/diff", 400],
  ["/api/apis/layout", 400],
  ["/api/apis/traffic-spec", 400],
  ["/api/openapi/document", 400],
  ["/api/sessions/list", 200],
  ["/api/sessions/export", 400],
  ["/api/sessions/export-live", 400],
  ["/api/sessions/file", 400],
  ["/api/sessions/environment", 200],
  ["/api/contract/report", 200],
  ["/api/storage", 200],
  ["/api/webhooks/list", 200],
  ["/api/editor/requests", 200],
  ["/api/editor/mocks", 200],
  ["/api/editor/endpoints", 200],
  ["/api/editor/calls", 400],
  ["/api/editor/findings", 200],
];

/* What Studio answers a route it does not have, which no route of the lists may get. */
function noSuchRoute(route: string): { error: string } {
  return { error: `Studio has no API route POST ${route}` };
}

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
  return new Promise((resolve) =>
    socket.once("events:replay", (payload) => resolve(replayed(payload))),
  );
}

/* Sent as written: fetch would resolve the dots and turn a backslash into a slash first. */
function raw(path: string, presented?: string): Promise<number> {
  const { port } = new URL(url);
  return new Promise((resolve, reject) => {
    const sent = request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: url,
          ...(presented !== undefined && { [TOKEN_HEADER]: presented }),
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      },
    );
    sent.on("error", reject);
    sent.end(JSON.stringify({ name: "spelled", requests: [] }));
  });
}

/* Every way a router, or a proxy in front of it, could read as the route. */
function spellings(route: string): string[] {
  const parent = route.slice(0, route.lastIndexOf("/"));
  const last = route.slice(route.lastIndexOf("/") + 1);
  return [
    `${route}/`,
    `${route}//`,
    `${route}/?x=1`,
    route.toUpperCase(),
    route.replace("/api/", "/API/"),
    `${parent}/${last.toUpperCase()}`,
    route.replace("/api/", "/api//"),
    `/${route}`,
    route.replace("/api/", "/api/./"),
    route.replace("/api/", "/api/x/../"),
    route.replace("/api/", "/api/%2e/"),
    route.replace("/api/", "/api/x/%2e%2e/"),
    route.replace("a", "%61"),
    route.replace("a", "%2561"),
    `${parent}%2F${last}`,
    `${parent}%2f${last}/`,
    route.replace("/api/", "/api\\"),
    `${parent}\\${last}`,
  ];
}

describe("a route that asks for the token", () => {
  it.each(TOKEN_ROUTES)("refuses %s to a caller without the token", async (route) => {
    expect(await post(route, {})).toEqual({ status: 401, body: REFUSED });
  });

  it.each(TOKEN_ROUTES)(
    "refuses %s to a caller without the token, however the path is spelled",
    async (route) => {
      const statuses = await Promise.all(spellings(route).map((path) => raw(path)));

      expect(statuses).toEqual(spellings(route).map(() => 401));
    },
  );

  it.each(TOKEN_ROUTES)("serves %s to a caller with the token", async (route) => {
    const answer = await post(route, {}, token());

    expect(answer.status).not.toBe(401);
    expect(answer.body).not.toEqual(noSuchRoute(route));
  });

  it.each([
    "/api/editor/sites",
    "/api/editor/definitions",
    "/api/editor/groups",
    "/api/apis/manage/inventory",
    "/api/apis/manage/preview",
    "/api/apis/update/preview",
  ])(
    "refuses %s, which reads the project's code or files, to a caller without the token",
    async (route) => {
      expect(TOKEN_ROUTES).toContain(route);
      expect(await post(route, {})).toEqual({ status: 401, body: REFUSED });
    },
  );

  it.each([
    "/api/sessions/..%2F..%2Fhealth",
    "/api/sessions/..%5C..%5Chealth",
    "/api/editor/%2E%2E%2F%2E%2E%2Fexplorer",
    "/api/storage/../../explorer",
  ])(
    "refuses %s, a path that climbs out of the API within it, to a caller without the token",
    async (path) => {
      expect(await raw(path)).toBe(401);
    },
  );

  it("refuses a path of escapes within escapes at once, to a caller without the token", async () => {
    expect(await raw(`/%25${"25".repeat(7_000)}61`)).toBe(401);
    expect(await raw(`/api/%25${"25".repeat(7_000)}61`)).toBe(401);
  });

  it("saves no session for any spelling a caller without the token tried", async () => {
    await Promise.all(spellings("/api/sessions/save").map((path) => raw(path)));

    expect(await post("/api/sessions/list", {})).toEqual({ status: 200, body: [] });
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

  it("are each listed with what they answer a caller without the token", () => {
    expect(OPEN_ANSWERS.map(([route]) => route).sort()).toEqual([...OPEN_ROUTES].sort());
  });

  it.each(OPEN_ANSWERS)("is open to a caller without the token: %s", async (route, status) => {
    const answer =
      route === "/api/health"
        ? await fetch(`${url}${route}`, { headers: { origin: url } })
        : await fetch(`${url}${route}`, {
            method: "POST",
            headers: { "content-type": "application/json", origin: url },
            body: "{}",
          });
    const body: unknown = await answer.json();

    expect(answer.status).toBe(status);
    expect(body).not.toEqual(REFUSED);
    expect(body).not.toEqual(noSuchRoute(route));
  });

  it("is reached by the one spelling it names, even with the token", async () => {
    const statuses = await Promise.all(
      [
        "/api/sessions/list/",
        "/API/sessions/list",
        "/api/Sessions/list",
        "/api//sessions/list",
      ].map((path) => raw(path, token())),
    );

    expect(statuses).toEqual([404, 404, 404, 404]);
    expect(await raw("/api/sessions/list", token())).toBe(200);
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

  it("has an event Studio does not list refused rather than run", async () => {
    const socket = await page();
    const told = new Promise((resolve) => socket.once("studio:read-only", resolve));

    socket.emit("an:event:added:later", { id: "x" });
    const answered: unknown = await socket
      .timeout(5_000)
      .emitWithAck("another:event:added:later", { id: "y" });

    expect(await told).toEqual({ event: "an:event:added:later", error: TOKEN_REFUSAL });
    expect(answered).toEqual({ ok: false, error: TOKEN_REFUSAL });
  });

  it("is answered what it asks to read: a mock's records, a request's whole body", async () => {
    const socket = await page();

    const records: unknown = await socket
      .timeout(5_000)
      .emitWithAck("mock:store:get", { serverId: "shop" });
    const body: unknown = await socket
      .timeout(5_000)
      .emitWithAck("request:body", { sessionId: "s", requestId: "r", part: "response" });

    expect(records).toEqual({ ok: false, error: 'Studio runs no mock named "shop".' });
    expect(body).not.toEqual({ ok: false, error: TOKEN_REFUSAL });
    expect(body).toEqual(expect.objectContaining({ ok: false, error: expect.any(String) }));
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
    const seen = new Promise((resolve) =>
      watching.once("events", (events: unknown[]) => resolve(events[0])),
    );
    sendRuntimeEvents(app, [
      {
        id: "r1",
        type: "request:start",
        timestamp: Date.now(),
        sessionId: "server",
        source: "api",
        method: "list",
      },
    ]);
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
    const seenByReader = new Promise((resolve) =>
      reader.once("events", (events: unknown[]) => resolve(events[0])),
    );
    const seenByOwner = new Promise((resolve) =>
      owner.once("events", (events: unknown[]) => resolve(events[0])),
    );

    sendRuntimeEvents(app, [
      {
        id: "r1",
        type: "request:start",
        timestamp: Date.now(),
        sessionId: "server",
        source: "api",
        method: "list",
        requestHeaders: { authorization: "Bearer secret", accept: "application/json" },
      },
    ]);

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
    const seen = new Promise((resolve) =>
      watching.once("events", (events: unknown[]) => resolve(events[0])),
    );
    sendRuntimeEvents(app, [
      {
        id: "r1",
        type: "request:start",
        timestamp: Date.now(),
        sessionId: "server",
        source: "api",
        method: "list",
      },
    ]);
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
