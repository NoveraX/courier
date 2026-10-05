/**
 * Studio served as a public demo. A visitor — a page without the token —
 * may send from the Playground and drive the mocks, within limits that
 * keep one visitor from crowding out the rest; it still writes no file,
 * clears nothing every visitor sees, and keeps its Playground history to
 * its own page. The host, with the token, keeps every right.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import { DEMO_SHARED_REFUSAL, DEMO_WRITE_REFUSAL } from "../src/server/demo/demo-refusals";
import { DEMO_MAX_MESSAGE_BYTES } from "../src/server/demo/demo-visitors";
import { TOKEN_HEADER } from "../src/server/token-guard";
import type { StudioServer } from "../src/server/types";

const RESETS_AT = Date.UTC(2026, 9, 5, 18, 0);

let root: string;
let url: string;
let studio: StudioServer | undefined;
const sockets: Socket[] = [];

beforeEach(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = mkdtempSync(join(tmpdir(), "courier-demo-"));
  writeFileSync(
    join(root, "courier.config.ts"),
    'export default { sources: { api: { baseURL: "https://api.example" } } };\n',
  );
  url = await new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      demo: { resetsAt: RESETS_AT },
      onReady: resolve,
      onError: reject,
    });
  });
}, 30_000);

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function token(): string {
  if (!studio) throw new Error("Studio is not running");
  return studio.token;
}

async function open(namespace: "/ui" | "/runtime", presented?: string): Promise<Socket> {
  const socket = connect(`${url}${namespace}`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    auth: presented === undefined ? {} : { token: presented },
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return socket;
}

/* A runtime with the token serving `api` over SSE, which never answers: each call stays open. */
async function silentRuntime(): Promise<Socket> {
  const socket = await open("/runtime", token());
  socket.emit("runtime:hello", { runtimeId: "server", kind: "server" });
  socket.emit("runtime:announce", { transports: ["http", "sse"], sources: ["api"] });
  await new Promise((resolve) => setTimeout(resolve, 100));
  return socket;
}

function ended(page: Socket, rid: string): Promise<unknown> {
  return new Promise((resolve) => {
    const listener = (payload: { rid?: unknown; error?: { message?: unknown } }) => {
      if (payload.rid !== rid) return;
      page.off("playground:error", listener);
      resolve(payload.error?.message);
    };
    page.on("playground:error", listener);
  });
}

function call(page: Socket, rid: string, transport: "http" | "sse" = "http"): void {
  page.emit("playground:exec", { rid, source: "api", group: "users", method: "list", transport });
}

function command(page: Socket, sent: Record<string, unknown>): Promise<unknown> {
  return page.timeout(5_000).emitWithAck("mock:command", { serverId: "shop", ...sent });
}

async function post(path: string, presented?: string): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json", origin: url };
  if (presented !== undefined) headers[TOKEN_HEADER] = presented;
  return fetch(`${url}${path}`, { method: "POST", headers, body: "{}" });
}

describe("a page of the demo", () => {
  it("is told it is a demo, and when the demo resets", async () => {
    const socket = connect(`${url}/ui`, { transports: ["websocket"], forceNew: true });
    sockets.push(socket);

    const info = await new Promise((resolve) => socket.once("studio:info", resolve));

    expect(info).toEqual(expect.objectContaining({ demo: { resetsAt: RESETS_AT } }));
  });
});

describe("a visitor's Playground calls", () => {
  it("are sent on, up to ten from one page every ten seconds", async () => {
    const page = await open("/ui");

    const answers = await Promise.all(
      Array.from({ length: 11 }, (_, n) => {
        const answer = ended(page, `call-${n}`);
        call(page, `call-${n}`);
        return answer;
      }),
    );

    expect(answers.slice(0, 10)).toEqual(Array(10).fill("No runtime hosts api on HTTP"));
    expect(answers[10]).toBe(
      "The demo takes up to 10 Playground calls every 10 s from one page. Try again in a moment.",
    );
  });

  it("stay open up to four from one page", async () => {
    await silentRuntime();
    const page = await open("/ui");
    for (let n = 0; n < 4; n++) call(page, `stream-${n}`, "sse");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const fifth = ended(page, "stream-4");
    call(page, "stream-4", "sse");

    expect(await fifth).toBe(
      "The demo keeps up to 4 Playground calls open for one page. Stop one to start another.",
    );
  });
});

describe("a visitor's mock commands", () => {
  it("reach the mocks within the demo's bounds", async () => {
    const page = await open("/ui");

    expect(await command(page, { action: "mock:store:seed", count: 10 })).toEqual({
      ok: false,
      error: 'No mock is named "shop".',
    });
    expect(await command(page, { action: "mock:store:seed", count: 5_000 })).toEqual({
      ok: false,
      error: "The demo seeds up to 200 records at a time.",
    });
  });

  it("are turned away once they weigh more than a record should", async () => {
    const page = await open("/ui");

    const reply = await command(page, {
      action: "mock:store:create",
      collection: "users",
      record: { name: "x".repeat(10_000) },
    });

    expect(reply).toEqual({
      ok: false,
      error: "The demo takes up to 8 KB at a time from a visitor.",
    });
  });
});

describe("what every visitor sees", () => {
  it("is not cleared by a visitor, who is told why", async () => {
    const page = await open("/ui");
    const told = new Promise((resolve) => page.once("studio:read-only", resolve));

    page.emit("requests:clear", { keep: [] });

    expect(await told).toEqual({ event: "requests:clear", error: DEMO_SHARED_REFUSAL });
  });

  it("is cleared by the host, whose commands are not bounded", async () => {
    const host = await open("/ui", token());

    expect(await command(host, { action: "mock:store:seed", count: 5_000 })).toEqual({
      ok: false,
      error: 'No mock is named "shop".',
    });
  });
});

describe("the Playground history", () => {
  it("stays in each visitor's page, unseen by the others, and the host's is kept", async () => {
    const host = await open("/ui", token());
    host.emit("playground:history:save", [
      { id: "e1", rid: "r1", source: "api", method: "list", status: "success" },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const visitor = connect(`${url}/ui`, { transports: ["websocket"], forceNew: true });
    sockets.push(visitor);
    const shown = await new Promise((resolve) => visitor.once("playground:history", resolve));
    let refused = false;
    visitor.on("studio:read-only", () => {
      refused = true;
    });
    visitor.emit("playground:history:save", [{ id: "v1", rid: "v1", source: "api", method: "x" }]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const next = connect(`${url}/ui`, {
      transports: ["websocket"],
      forceNew: true,
      auth: { token: token() },
    });
    sockets.push(next);

    expect(shown).toEqual([]);
    expect(refused).toBe(false);
    expect(await new Promise((resolve) => next.once("playground:history", resolve))).toEqual([
      expect.objectContaining({ id: "e1" }),
    ]);
  });
});

describe("the demo's API", () => {
  it("writes no file for a visitor, and says why", async () => {
    const response = await post("/api/apis/write");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: DEMO_WRITE_REFUSAL,
      code: "STUDIO_TOKEN_REQUIRED",
    });
  });

  it("answers its visitors up to sixty requests every ten seconds, and the host always", async () => {
    const statuses: number[] = [];
    for (let n = 0; n < 61; n++) statuses.push((await post("/api/sessions/list")).status);

    expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
    expect(statuses[60]).toBe(429);
    expect((await post("/api/sessions/list", token())).status).toBe(200);
  });
});

describe("a message larger than the demo reads", () => {
  it("closes the socket that sent it", async () => {
    const page = await open("/ui");
    const closed = new Promise((resolve) => page.once("disconnect", resolve));

    page.emit("playground:write", { rid: "r", data: "x".repeat(DEMO_MAX_MESSAGE_BYTES + 1) });

    expect(await closed).toBe("transport close");
  });
});
