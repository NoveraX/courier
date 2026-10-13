/**
 * Studio served as a public demo. A visitor — a page without the token —
 * may send from the Playground and drive the mocks, within limits that
 * keep one visitor from crowding out the rest; it still writes no file,
 * clears nothing every visitor sees, and keeps its Playground history to
 * its own page. The host, with the token, keeps every right.
 */
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, request } from "node:http";
import { type AddressInfo, createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import {
  DEMO_FILE_REFUSAL,
  DEMO_SHARED_REFUSAL,
  DEMO_TOKEN_REFUSAL,
} from "../src/server/demo/demo-refusals";
import { DEMO_LARGE_BODY, DEMO_REST_BUSY } from "../src/server/demo/demo-rest-guard";
import { DEMO_SERVER_OPTIONS } from "../src/server/demo/demo-serving";
import { DEMO_MAX_MESSAGE_BYTES } from "../src/server/demo/demo-visitors";
import { TOKEN_HEADER } from "../src/server/token-guard";
import type { StudioServer } from "../src/server/types";

const RESETS_AT = Date.UTC(2026, 9, 5, 18, 0);
/* A DDoS filter in front of the demo's proxy, one of whose nodes every visitor below comes through. */
const FILTER_RANGE = "198.51.100.128/25";
const FILTER_NODE = "198.51.100.200";

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
      demo: {
        resetsAt: RESETS_AT,
        trustedProxies: [FILTER_RANGE],
        addressHeader: "DDG-Connecting-IP",
      },
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

async function post(
  path: string,
  presented?: string,
  body: unknown = {},
  visitor?: string,
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json", origin: url };
  if (presented !== undefined) headers[TOKEN_HEADER] = presented;
  /* A visitor reaches the demo through a proxy on this machine, which says who it is. */
  if (visitor !== undefined) headers["x-forwarded-for"] = visitor;
  return fetch(`${url}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

/* Sent as written, a visitor's: fetch would resolve the dots before sending. */
function rawPost(path: string, body: unknown): Promise<number> {
  const { hostname, port } = new URL(url);
  return new Promise((resolve, reject) => {
    const sent = request(
      {
        host: hostname,
        port,
        path,
        method: "POST",
        headers: { "content-type": "application/json", origin: url },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      },
    );
    sent.on("error", reject);
    sent.end(JSON.stringify(body));
  });
}

/* A specification served on this machine, as the demo's own services are. */
async function localSpec(): Promise<{ url: string; close: () => Promise<void> }> {
  const spec = { openapi: "3.0.0", info: { title: "Local", version: "1" }, paths: {} };
  const server = createHttpServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(spec));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/openapi.json`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

describe("a page of the demo", () => {
  it("is told it is a demo and when it resets, and nothing of the proxies it trusts", async () => {
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

describe("an event the demo does not name", () => {
  it("is refused to a visitor, who is told why, and still run for the host", async () => {
    const visitor = await open("/ui");
    const host = await open("/ui", token());
    const told = new Promise((resolve) => visitor.once("studio:read-only", resolve));
    let hostTold = false;
    host.on("studio:read-only", () => {
      hostTold = true;
    });

    visitor.emit("an:event:added:later", {});
    host.emit("an:event:added:later", {});

    expect(await told).toEqual({ event: "an:event:added:later", error: DEMO_TOKEN_REFUSAL });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(hostTold).toBe(false);
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
      error: DEMO_TOKEN_REFUSAL,
      code: "STUDIO_TOKEN_REQUIRED",
    });
  });

  it.each([
    "/api/apis/imports/check-updates",
    "/api/apis/imports/check-all",
    "/api/apis/declare/preview",
    "/api/mocks/declare/preview",
    "/api/apis/imports/remove/preview",
    "/api/apis/manage/inventory",
    "/api/apis/manage/preview",
    "/api/apis/update/preview",
    "/api/editor/sites",
  ])("reads nothing past what it shows for a visitor at %s, and says why", async (path) => {
    const response = await post(path, undefined, { name: "pets" });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: DEMO_TOKEN_REFUSAL,
      code: "STUDIO_TOKEN_REQUIRED",
    });
  });

  it("writes nothing for a visitor however the route is spelled", async () => {
    const spelled = [
      "/api/sessions/save/",
      "/API/SESSIONS/SAVE",
      "/api/Sessions/save",
      "/api//sessions/save",
      "/api/sessions/%73ave",
      "/api/x/../sessions/save",
      "/api/x/%2e%2e/sessions/save",
      "/x/..%2Fapi/sessions/save",
    ];

    const statuses = await Promise.all(
      spelled.map((path) => rawPost(path, { name: "spelled", requests: [] })),
    );

    expect(statuses).toEqual(spelled.map(() => 401));
    expect(await (await post("/api/sessions/list", token())).json()).toEqual([]);
  });

  it("answers an address up to twenty requests every ten seconds, every visitor sixty, and the host always", async () => {
    const from = (visitor: string) => post("/api/sessions/list", undefined, {}, visitor);
    const one: number[] = [];
    for (let n = 0; n < 21; n++) one.push((await from("203.0.113.1")).status);
    const others: number[] = [];
    for (let n = 0; n < 40; n++) others.push((await from(`203.0.113.${10 + (n % 2)}`)).status);

    expect(one.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(one[20]).toBe(429);
    expect(others.every((status) => status === 200)).toBe(true);
    expect((await from("203.0.113.99")).status).toBe(429);
    expect((await post("/api/sessions/list", token())).status).toBe(200);
  });
});

describe("the demo's API at work", () => {
  /* A visitor's request whose body is still on its way, which the API holds open. */
  function hanging(visitor: string): () => void {
    const { hostname, port } = new URL(url);
    const pending = request({
      host: hostname,
      port,
      method: "POST",
      path: "/api/apis/parse",
      headers: {
        "content-type": "application/json",
        "content-length": String(DEMO_LARGE_BODY + 1000),
        origin: url,
        "x-forwarded-for": visitor,
      },
    });
    pending.on("error", () => {});
    pending.write('{"source":"raw",');
    return () => pending.destroy();
  }

  it("works on two visitors' requests at once, and turns a third away until one ends", async () => {
    const ends = [hanging("203.0.113.21"), hanging("203.0.113.22")];
    await new Promise((resolve) => setTimeout(resolve, 100));

    const large = { pad: "x".repeat(DEMO_LARGE_BODY) };
    const third = await post("/api/sessions/list", undefined, large, "203.0.113.23");
    for (const end of ends) end();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const later = await post("/api/sessions/list", undefined, large, "203.0.113.23");

    expect(third.status).toBe(429);
    expect(((await third.json()) as { error: string }).error).toBe(DEMO_REST_BUSY);
    expect(later.status).toBe(200);
    expect((await post("/api/sessions/list", token())).status).toBe(200);
  });
});

describe("a connection that sends its request a byte at a time", () => {
  it("is closed once ten seconds pass without its headers", async () => {
    const { hostname, port } = new URL(url);
    const startedAt = Date.now();
    const socket = createConnection({ host: hostname, port: Number(port) });
    socket.on("error", () => {});
    socket.write("GET / HTTP/1.1\r\nHost: demo\r\n");
    const trickle = setInterval(() => socket.write("X"), 1000);

    await new Promise<void>((resolve) => socket.once("close", () => resolve()));
    clearInterval(trickle);

    expect(Date.now() - startedAt).toBeLessThan(DEMO_SERVER_OPTIONS.headersTimeout + 3 * 2_000);
  }, 30_000);
});

describe("the demo's HTTP server", () => {
  it("answers an address up to six hundred requests every ten seconds, then says when to come back", async () => {
    const get = (visitor: string) =>
      fetch(`${url}/api/health`, { headers: { "x-forwarded-for": visitor } });
    const statuses: number[] = [];
    for (let n = 0; n < 600; n++) statuses.push((await get("198.51.100.7")).status);

    const refused = await get("198.51.100.7");

    expect(statuses.every((status) => status === 200)).toBe(true);
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("10");
    expect((await get("198.51.100.8")).status).toBe(200);
  }, 30_000);
});

describe("the demo's sockets, counted by address", () => {
  /* A page reached through a proxy on this machine, which says who opened it. */
  async function visit(visitor: string, headers: Record<string, string> = {}): Promise<boolean> {
    const socket = connect(`${url}/ui`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      extraHeaders: { ...headers, "x-forwarded-for": visitor },
    });
    sockets.push(socket);
    return new Promise<boolean>((resolve) => {
      socket.once("connect", () => resolve(true));
      socket.once("connect_error", () => resolve(false));
    });
  }

  it("are held open up to ten for one address, and still for another", async () => {
    const opened: boolean[] = [];
    for (let n = 0; n < 10; n++) opened.push(await visit("192.0.2.200"));

    expect(opened.every(Boolean)).toBe(true);
    expect(await visit("192.0.2.200")).toBe(false);
    expect(await visit("192.0.2.201")).toBe(true);
  });

  it("are opened up to ten every ten seconds for one address, each sent the logs", async () => {
    for (let n = 0; n < 10; n++) expect(await visit("192.0.2.210")).toBe(true);
    for (const socket of sockets.splice(0)) socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await visit("192.0.2.210")).toBe(false);
    expect(await visit("192.0.2.211")).toBe(true);
  });

  it("are counted by the address a trusted filter saw, not the filter's own", async () => {
    const opened: boolean[] = [];
    for (let n = 0; n < 10; n++) opened.push(await visit(`192.0.2.220, ${FILTER_NODE}`));

    expect(opened.every(Boolean)).toBe(true);
    expect(await visit(`192.0.2.220, ${FILTER_NODE}`)).toBe(false);
    expect(await visit(`192.0.2.221, ${FILTER_NODE}`)).toBe(true);
    expect(await visit(`192.0.2.220, 192.0.2.221, ${FILTER_NODE}`)).toBe(true);
  });

  it("are counted by the address the filter names, when the proxy reported only the filter's", async () => {
    const named = (visitor: string) => ({ "ddg-connecting-ip": visitor });
    const opened: boolean[] = [];
    for (let n = 0; n < 10; n++) opened.push(await visit(FILTER_NODE, named("192.0.2.230")));

    expect(opened.every(Boolean)).toBe(true);
    expect(await visit(FILTER_NODE, named("192.0.2.230"))).toBe(false);
    expect(await visit(FILTER_NODE, named("192.0.2.231"))).toBe(true);
    /* A visitor that came past the filter is counted by its own address, whatever it names. */
    expect(await visit("192.0.2.230", named("192.0.2.232"))).toBe(false);
  });
});

describe("a specification a visitor imports", () => {
  it("is never read from a file of the project, which the host may read", async () => {
    const asked = { source: "file", content: "courier.config.ts" };

    const visitor = await post("/api/apis/parse", undefined, asked);
    const host = await post("/api/apis/parse", token(), asked);

    expect(visitor.status).toBe(403);
    expect(await visitor.json()).toEqual({ error: DEMO_FILE_REFUSAL, code: "STUDIO_DEMO_REFUSED" });
    expect(host.status).toBe(400);
  });

  it("is never fetched from this machine, from which the host may fetch it", async () => {
    const spec = await localSpec();
    const asked = { source: "url", content: spec.url };

    const visitor = await post("/api/apis/parse", undefined, asked);
    const host = await post("/api/apis/parse", token(), asked);
    await spec.close();

    expect(visitor.status).toBe(400);
    expect(((await visitor.json()) as { error: string }).error).toContain("public internet only");
    expect(host.status).toBe(200);
  });
});

describe("a runtime of the demo", () => {
  it("is told, as it says hello, the largest message the demo takes", async () => {
    const runtime = await open("/runtime", token());

    const welcome = await runtime.emitWithAck("runtime:hello", {
      runtimeId: "app",
      kind: "server",
    });

    expect(welcome).toEqual({ maxMessageBytes: DEMO_MAX_MESSAGE_BYTES });
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

/* The WebSocket extensions Studio agrees to when a client offers to compress. */
function negotiatedExtensions(base: string): Promise<string | undefined> {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    const upgrade = request({
      hostname,
      port,
      path: "/socket.io/?EIO=4&transport=websocket",
      headers: {
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-version": "13",
        "sec-websocket-key": randomBytes(16).toString("base64"),
        "sec-websocket-extensions": "permessage-deflate; client_max_window_bits",
      },
    });
    upgrade.once("upgrade", (response, socket) => {
      socket.destroy();
      const extensions = response.headers["sec-websocket-extensions"];
      resolve(typeof extensions === "string" ? extensions : undefined);
    });
    upgrade.once("response", (response) => reject(new Error(`no upgrade: ${response.statusCode}`)));
    upgrade.once("error", reject);
    upgrade.end();
  });
}

describe("the demo's sockets", () => {
  it("compress what they send, which a page on the network fetches", async () => {
    expect(await negotiatedExtensions(url)).toContain("permessage-deflate");
  });

  it("send uncompressed outside a demo, to a page on this machine", async () => {
    const plainRoot = mkdtempSync(join(tmpdir(), "courier-plain-"));
    writeFileSync(join(plainRoot, "courier.config.ts"), "export default { sources: {} };\n");
    let plain: StudioServer | undefined;
    const plainUrl = await new Promise<string>((resolve, reject) => {
      plain = createStudioServer({
        port: 0,
        host: "127.0.0.1",
        projectRoot: plainRoot,
        onReady: resolve,
        onError: reject,
      });
    });

    try {
      expect(await negotiatedExtensions(plainUrl)).toBeUndefined();
    } finally {
      await plain?.close();
      rmSync(plainRoot, { recursive: true, force: true });
    }
  });
});
