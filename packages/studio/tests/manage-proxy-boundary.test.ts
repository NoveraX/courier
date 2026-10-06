/**
 * An import of an API with streams gives its proxy caller a boundary
 * naming every endpoint: managing the import's endpoints writes the proxy
 * caller again, so the boundary always names the endpoints the import has.
 */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSpec } from "../src/apis/parser/parse-spec";
import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";
import { tokenHeader } from "./helpers/token-header";

const OPTIONS = {
  importType: "file",
  type: "openapi",
  outputDir: "src/api",
  generateClient: "proxy",
};
const CONFIG = `export default { sources: { api: { baseURL: "https://api.example" } }, imports: { shop: ${JSON.stringify(OPTIONS)} } };\n`;
const events = {
  "200": {
    description: "events",
    content: { "text/event-stream": { schema: { type: "string" } } },
  },
};
const ok = { "200": { description: "ok" } };
const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Shop", version: "1" },
    paths: {
      "/orders": { get: { operationId: "listOrders", tags: ["orders"], responses: ok } },
      "/orders/events": {
        get: { operationId: "watchOrders", tags: ["orders"], responses: events },
      },
      "/health": { get: { operationId: "health", responses: ok } },
    },
  }),
);
const PROXY = "src/api/shop/proxy.ts";

let scratch: string;
let root: string;
let studio: StudioServer | undefined;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-manage-proxy-")));
  root = join(scratch, "proj");
  mkdirSync(dirname(join(root, "courier.config.ts")), { recursive: true });
  writeFileSync(join(root, "courier.config.ts"), CONFIG);
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  vi.restoreAllMocks();
  rmSync(scratch, { recursive: true, force: true });
});

function start(): Promise<string> {
  return new Promise((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
}

async function post(url: string, path: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url, ...tokenHeader(studio) },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  return typeof payload === "object" && payload !== null ? { ...payload } : {};
}

async function manage(
  url: string,
  change: Record<string, Record<string, string[]>>,
): Promise<void> {
  const body = { name: "shop", spec: SPEC, toAdd: {}, toRemove: {}, ...change };
  const preview = await post(url, "/api/apis/manage/preview", body);
  const plan = preview.plan as { digest: string };
  await post(url, "/api/apis/manage/apply", { ...body, planDigest: plan.digest });
}

const write = (selectedEndpoints: Record<string, string[]>) => ({
  sourceName: "shop",
  spec: SPEC,
  options: {
    type: "openapi",
    outputDir: "src/api",
    sourceName: "shop",
    generateClient: "proxy",
    selectedEndpoints,
  },
});

describe("the proxy caller of an import with streams", () => {
  it("names in its boundary each endpoint managing the import adds, and drops each it removes", async () => {
    const url = await start();
    await post(url, "/api/apis/write", write({ orders: ["listOrders", "watchOrders"] }));
    const first = readFileSync(join(root, PROXY), "utf8");

    await manage(url, { toAdd: { "": ["health"] } });
    const added = readFileSync(join(root, PROXY), "utf8");
    await manage(url, { toRemove: { orders: ["listOrders"] } });
    const removed = readFileSync(join(root, PROXY), "utf8");

    expect(first).toContain('"orders.watchOrders": "stream",');
    expect(first).not.toContain("health:");
    expect(added).toContain('    health: "query",');
    expect(added).toContain('"orders.listOrders": "query",');
    expect(removed).not.toContain("orders.listOrders");
    expect(removed).toContain('"orders.watchOrders": "stream",');
  }, 30_000);
});
