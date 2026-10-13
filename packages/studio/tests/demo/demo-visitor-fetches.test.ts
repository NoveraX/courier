/**
 * A demo's visitor who asks Studio to fetch a specification from a slow
 * host and hangs up stops that fetch: the host sees its connection closed,
 * and the visitor's place among the requests the demo works on is free
 * again once the fetch has ended — not left running behind a free place,
 * its name's lookup included.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../../src/server/create-studio-server";
import { DEMO_REST_IN_FLIGHT } from "../../src/server/demo/demo-rest-guard";
import type { StudioServer } from "../../src/server/types";
import { VISITOR_FETCHES } from "../../src/server/visitor-fetches";

/* The slow host listens on this machine; here it stands for a host on the public internet. */
vi.mock("../../src/server/address-kind-here", () => ({ addressKindHere: () => "public" }));

/* Public DNS whose answers the test holds back: a lookup cancelling does not end, as this machine's do. */
const lookups = vi.hoisted(() => ({ waiting: [] as Array<(addresses: string[]) => void> }));

vi.mock("../../src/server/public-resolver", () => ({
  publicResolver: () => ({
    resolve4: () => new Promise<string[]>((resolve) => lookups.waiting.push(resolve)),
    resolve6: () => Promise.reject(Object.assign(new Error("no AAAA"), { code: "ENODATA" })),
    cancel: () => {},
  }),
}));

let root: string;
let url: string;
let studio: StudioServer | undefined;
let host: Server | undefined;
let open = 0;
let seen = 0;
let specUrl = "";

beforeEach(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = mkdtempSync(join(tmpdir(), "courier-demo-fetches-"));
  writeFileSync(join(root, "courier.config.ts"), "export default { sources: {} };\n");
  open = 0;
  seen = 0;
  host = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.write("{");
  });
  host.on("connection", (socket) => {
    open++;
    seen++;
    socket.on("close", () => open--);
  });
  await new Promise<void>((resolve) => host?.listen(0, "127.0.0.1", resolve));
  specUrl = `http://127.0.0.1:${(host.address() as AddressInfo).port}/openapi.json`;
  url = await new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      /* Each visitor comes through a proxy on this machine with an address of its own. */
      demo: { trustedProxies: ["127.0.0.1"] },
      onReady: resolve,
      onError: reject,
    });
  });
}, 30_000);

afterEach(async () => {
  for (const answer of lookups.waiting.splice(0)) answer(["127.0.0.1"]);
  await studio?.close();
  studio = undefined;
  host?.closeAllConnections();
  await new Promise((resolve) => host?.close(resolve));
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

/* A visitor that asks for the slow host's specification, and hangs up once Studio is fetching it. */
async function askAndHangUp(nth: number, specAt = specUrl): Promise<void> {
  const { port } = new URL(url);
  const asking = request({
    host: "127.0.0.1",
    port,
    path: "/api/apis/parse",
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: url,
      "x-forwarded-for": `203.0.113.${nth}`,
    },
  });
  asking.on("error", () => {});
  asking.end(JSON.stringify({ source: "url", content: specAt }));
  await vi.waitUntil(() => seen + lookups.waiting.length === nth, { timeout: 5_000 });
  asking.destroy();
}

/* A visitor's import of the slow host's specification, by its URL. */
function parseUrl(visitor: string, signal?: AbortSignal): Promise<Response> {
  return fetch(`${url}/api/apis/parse`, {
    method: "POST",
    ...(signal === undefined ? {} : { signal }),
    headers: { "content-type": "application/json", origin: url, "x-forwarded-for": visitor },
    body: JSON.stringify({ source: "url", content: specUrl }),
  });
}

describe("a demo visitor who hangs up on a fetch", () => {
  it("has Studio stop fetching, and frees its place once the fetch has ended", async () => {
    for (let n = 1; n <= DEMO_REST_IN_FLIGHT; n++) await askAndHangUp(n);

    await vi.waitUntil(() => open === 0, { timeout: 5_000 });
    const next = await fetch(`${url}/api/sessions/list`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: url },
      body: "{}",
    });

    expect(open).toBe(0);
    expect(next.status).toBe(200);
  });

  it("keeps its fetch's place until the lookup of its host's name has settled", async () => {
    for (let n = 1; n <= VISITOR_FETCHES; n++) {
      await askAndHangUp(n, `http://stuck-${n}.test/openapi.json`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));

    const whileLooking = await parseUrl("203.0.113.99");
    for (const answer of lookups.waiting.splice(0)) answer(["127.0.0.1"]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const before = seen;
    const leave = new AbortController();
    const admitted = parseUrl("203.0.113.99", leave.signal).catch(() => undefined);
    await vi.waitUntil(() => seen > before, { timeout: 5_000 });
    leave.abort();
    await admitted;

    expect(whileLooking.status).toBe(503);
    expect(((await whileLooking.json()) as { code: string }).code).toBe("STUDIO_BUSY");
    expect(seen).toBe(before + 1);
  });
});
