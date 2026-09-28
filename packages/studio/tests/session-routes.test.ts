/**
 * Saved sessions, over Studio's own API: saved from the requests the UI
 * captured, listed, loaded, exported and deleted.
 *
 * A request Studio cannot read is answered 400 with the reason, never 500,
 * and a `.courier/sessions` that is a link is refused like any folder Studio
 * keeps in `.courier`: it used to list, read, write and delete JSON files
 * wherever the link pointed.
 */
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import { MAX_SESSION_REQUESTS } from "../src/server/session-body";
import type { StudioServer } from "../src/server/types";

const REQUESTS = [
  {
    id: "r1",
    source: "api",
    group: "users",
    method: "list",
    httpMethod: "GET",
    status: "success",
    statusCode: 200,
    timing: { total: 12 },
    size: 40,
    data: [{ id: 1 }],
    url: "http://localhost:3000/users",
    startedAt: 1_000,
    sessionId: "s",
    headers: { "content-type": "application/json" },
  },
  {
    id: "r2",
    source: "api",
    group: "users",
    method: "create",
    httpMethod: "POST",
    variables: { name: "x" },
    status: "error",
    statusCode: 500,
    error: { type: "http", status: 500, message: "boom" },
    startedAt: 2_000,
    sessionId: "s",
  },
];

let scratch: string;
let root: string;
let studio: StudioServer | undefined;
let url: string;

beforeEach(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-sessions-")));
  root = join(scratch, "proj");
  mkdirSync(root);
  writeFileSync(join(root, "courier.config.ts"), 'export default { sources: { api: { baseURL: "https://api.example" } } };\n');
  url = await new Promise<string>((resolve, reject) => {
    studio = createStudioServer({ port: 0, host: "127.0.0.1", projectRoot: root, onReady: resolve, onError: reject });
  });
}, 30_000);

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(scratch, { recursive: true, force: true });
});

async function call(path: string, body: unknown, type = "application/json"): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${url}/api/sessions/${path}`, {
    method: "POST",
    headers: { "content-type": type, origin: url },
    ...(body !== undefined && { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value ? Reflect.get(value, key) : undefined;
}

describe("a saved session", () => {
  it("is listed, loaded, exported and deleted", async () => {
    const saved = await call("save", { name: "first", requests: REQUESTS });
    expect(saved.status).toBe(200);
    const id = field(saved.body, "id");
    expect(typeof id).toBe("string");

    const listed = await call("list", {});
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([
      expect.objectContaining({ id, name: "first", stats: expect.objectContaining({ totalRequests: 2, errorCount: 1 }) }),
    ]);

    const loaded = await call("load", { id });
    expect(loaded.status).toBe(200);
    expect(field(loaded.body, "requests")).toEqual([
      expect.objectContaining({ id: "r1", statusCode: 200, data: [{ id: 1 }] }),
      expect.objectContaining({ id: "r2", error: { type: "http", status: 500, message: "boom" } }),
    ]);
    expect(field(loaded.body, "duration")).toBe(1_000);

    expect((await call("export", { id, format: "har" })).status).toBe(200);
    expect((await call("delete", { id })).status).toBe(200);
    expect((await call("list", {})).body).toEqual([]);
  });
});

describe("a session request Studio cannot read", () => {
  it.each(["save", "load", "delete", "export"])("is answered 400 by %s without a JSON body", async (route) => {
    expect((await call(route, undefined)).status).toBe(400);
    expect((await call(route, "id=x", "text/plain")).status).toBe(400);
  });

  it.each([
    ["a request that is not an object", { requests: [null] }],
    ["a request that is a string", { requests: ["str"] }],
    ["apps that are not a list", { requests: [], apps: 5 }],
    ["an app that is not an object", { requests: [], apps: [null] }],
    ["a name that is not a string", { requests: [], name: 5 }],
  ])("is answered 400 for %s", async (_label, body) => {
    const reply = await call("save", body);

    expect(reply.status).toBe(400);
    expect(typeof field(reply.body, "error")).toBe("string");
  });

  it("is answered 413 for more requests than a session holds", async () => {
    const many = Array.from({ length: MAX_SESSION_REQUESTS + 1 }, (_, i) => ({ id: `r${i}`, startedAt: i }));

    const reply = await call("save", { requests: many });

    expect(reply.status).toBe(413);
    expect(field(reply.body, "error")).toBe(`A session holds at most ${MAX_SESSION_REQUESTS} requests.`);
  });

  it("saves as many requests as a session holds", async () => {
    const many = Array.from({ length: MAX_SESSION_REQUESTS }, (_, i) => ({ id: `r${i}`, startedAt: i + 1 }));

    const reply = await call("save", { requests: many });

    expect(reply.status).toBe(200);
  });

  it.each(["", "...", "../../package", "a/b"])("is answered 400 for the id %j", async (id) => {
    expect((await call("load", { id })).status).toBe(400);
    expect((await call("delete", { id })).status).toBe(400);
  });
});

describe("a .courier/sessions folder, as sessions were once kept", () => {
  it("is never read or written, even as a link out of the project", async () => {
    const outside = join(scratch, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "victim.json"), JSON.stringify({ id: "victim", secret: true }));
    symlinkSync(outside, join(root, ".courier", "sessions"), "dir");

    const saved = await call("save", { requests: REQUESTS });
    const listed = await call("list", {});
    const victim = await call("load", { id: "victim" });

    expect(saved.status).toBe(200);
    expect(listed.body).toEqual([expect.objectContaining({ id: field(saved.body, "id") })]);
    expect(victim.status).toBe(404);
    expect(readdirSync(outside)).toEqual(["victim.json"]);
  });
});

/** Stop the Studio running on the project and start another on it. */
async function restart(): Promise<void> {
  await studio?.close();
  url = await new Promise<string>((resolve, reject) => {
    studio = createStudioServer({ port: 0, host: "127.0.0.1", projectRoot: root, onReady: resolve, onError: reject });
  });
}

describe(".courier that is a link", () => {
  it("has Studio keep its sessions in memory, and write nothing through it", async () => {
    await studio?.close();
    const elsewhere = join(scratch, "elsewhere");
    mkdirSync(elsewhere);
    rmSync(join(root, ".courier"), { recursive: true, force: true });
    symlinkSync(elsewhere, join(root, ".courier"), "dir");
    await restart();

    const saved = await call("save", { requests: REQUESTS });
    const listed = await call("list", {});

    expect(saved.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(readdirSync(elsewhere)).toEqual([]);
  });
});

describe("a saved session", () => {
  it("outlives the Studio that saved it", async () => {
    const saved = await call("save", { name: "login flow", requests: REQUESTS });
    await restart();

    const listed = await call("list", {});
    const loaded = await call("load", { id: field(saved.body, "id") });

    expect(listed.body).toEqual([expect.objectContaining({ name: "login flow" })]);
    expect(field(loaded.body, "requests")).toHaveLength(2);
  });
});

/** A page that connects, with the session it is shown and the replays it is sent. */
async function page(): Promise<{ socket: Socket; shown: unknown[]; replays: unknown[] }> {
  const socket = connect(`${url}/ui`, { transports: ["websocket"], reconnection: false });
  const seen = { socket, shown: [] as unknown[], replays: [] as unknown[] };
  socket.on("view:session", (session: unknown) => seen.shown.push(session));
  socket.on("events:replay", (events: unknown) => seen.replays.push(events));
  await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
  return seen;
}

describe("the session a page loads", () => {
  it("is shown to a page that connects, across a restart, until one goes back to live", async () => {
    const saved = await call("save", { name: "login flow", requests: REQUESTS });
    await call("load", { id: field(saved.body, "id") });
    await restart();

    const reloaded = await page();
    await expect.poll(() => reloaded.shown.length).toBe(1);
    reloaded.socket.emit("view:live");
    await expect.poll(() => reloaded.replays.length).toBe(2);
    reloaded.socket.disconnect();
    const next = await page();
    await expect.poll(() => next.replays.length).toBe(1);

    expect(reloaded.shown[0]).toMatchObject({ name: "login flow" });
    expect(next.shown).toEqual([]);
    next.socket.disconnect();
  });

  it("is shown no more once it is deleted", async () => {
    const saved = await call("save", { requests: REQUESTS });
    await call("load", { id: field(saved.body, "id") });
    await call("delete", { id: field(saved.body, "id") });

    const next = await page();
    await expect.poll(() => next.replays.length).toBe(1);

    expect(next.shown).toEqual([]);
    next.socket.disconnect();
  });
});
