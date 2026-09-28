/**
 * Saved sessions, over Studio's own API: saved from the requests the UI
 * captured, listed, loaded, exported and deleted.
 *
 * A request Studio cannot read is answered 400 with the reason, never 500,
 * and a `.courier/sessions` that is a link is refused like any folder Studio
 * keeps in `.courier`: it used to list, read, write and delete JSON files
 * wherever the link pointed.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

describe(".courier/sessions that is a link out of the project", () => {
  let outside: string;

  beforeEach(() => {
    outside = join(scratch, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "victim.json"), JSON.stringify({ id: "victim", secret: true }));
    writeFileSync(join(outside, "package.json"), "{}");
    mkdirSync(join(root, ".courier"));
    symlinkSync(outside, join(root, ".courier", "sessions"), "dir");
  });

  it.each([
    ["list", {}],
    ["load", { id: "victim" }],
    ["export", { id: "victim", format: "json" }],
    ["delete", { id: "package" }],
    ["save", { requests: REQUESTS }],
  ])("is refused by %s with 409, and nothing there changes", async (route, body) => {
    const reply = await call(route, body);

    expect(reply.status).toBe(409);
    expect(field(reply.body, "code")).toBe("COURIER_DIR_UNSAFE");
    expect(readdirSync(outside).sort()).toEqual(["package.json", "victim.json"]);
  });
});

describe("a session file that is a link", () => {
  it("is neither listed nor loaded", async () => {
    const secret = join(scratch, "secret.json");
    writeFileSync(secret, JSON.stringify({ id: "linked", name: "secret" }));
    mkdirSync(join(root, ".courier", "sessions"), { recursive: true });
    symlinkSync(secret, join(root, ".courier", "sessions", "linked.json"));

    expect((await call("list", {})).body).toEqual([]);
    expect((await call("load", { id: "linked" })).status).toBe(404);
    expect(existsSync(secret)).toBe(true);
  });
});

describe(".courier that is a link", () => {
  it("is refused with 409", async () => {
    const elsewhere = join(scratch, "elsewhere");
    mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(root, ".courier"), "dir");

    for (const [route, body] of [
      ["list", {}],
      ["save", { requests: REQUESTS }],
    ] as const) {
      const reply = await call(route, body);
      expect(reply.status).toBe(409);
    }
    expect(readdirSync(elsewhere)).toEqual([]);
  });
});
