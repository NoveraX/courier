/**
 * An import with a proxy caller, as a project runs it: the caller takes its
 * routes from the routes module, which Studio writes as the config loads, so
 * managing the import's endpoints changes the routes module and leaves the
 * caller as it is.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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
const IMPORTS = `imports: { shop: ${JSON.stringify(OPTIONS)} }`;
const CONFIG = `export default { sources: {}, ${IMPORTS} };\n`;
const DECLARED = `import { shop } from "./src/api/shop/source";\n\nexport default { sources: { shop }, ${IMPORTS} };\n`;
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
/* The project imports Courier and zod, as an application would. */
const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");
const PROXY = "src/api/shop/proxy.ts";
const ROUTES = "courier.routes.ts";

let scratch: string;
let root: string;
let studio: StudioServer | undefined;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-manage-proxy-")));
  root = join(scratch, "proj");
  mkdirSync(dirname(join(root, "courier.config.ts")), { recursive: true });
  writeFileSync(join(root, "courier.config.ts"), CONFIG);
  symlinkSync(REPO_NODE_MODULES, join(root, "node_modules"), "dir");
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

/* Studio writes the routes module once the config it loads has changed. */
async function routesHolding(text: string): Promise<string> {
  let routes = "";
  await vi.waitFor(
    () => {
      routes = readFileSync(join(root, ROUTES), "utf8");
      expect(routes).toContain(text);
    },
    { timeout: 15_000, interval: 50 },
  );
  return routes;
}

describe("the proxy caller of an import", () => {
  it("takes the routes Studio writes, which follow each endpoint managing the import adds or removes", async () => {
    const url = await start();
    await post(url, "/api/apis/write", write({ orders: ["listOrders", "watchOrders"] }));
    const proxy = readFileSync(join(root, PROXY), "utf8");
    writeFileSync(join(root, "courier.config.ts"), DECLARED);

    const first = await routesHolding('"orders.watchOrders": { transport: "sse" },');
    await manage(url, { toAdd: { "": ["health"] } });
    const added = await routesHolding('"health": { type: "query" },');
    await manage(url, { toRemove: { orders: ["listOrders"] } });
    await vi.waitFor(
      () => expect(readFileSync(join(root, ROUTES), "utf8")).not.toContain("orders.listOrders"),
      {
        timeout: 15_000,
        interval: 50,
      },
    );

    expect(proxy).toContain('import { shopRoutes } from "../../../courier.routes";');
    expect(proxy).toContain("export const shopProxyApi = createProxyCaller(shopRoutes);");
    expect(first).toContain('"orders.listOrders": { type: "query" },');
    expect(first).not.toContain("health");
    expect(added).toContain('"orders.listOrders": { type: "query" },');
    expect(readFileSync(join(root, ROUTES), "utf8")).toContain(
      '"orders.watchOrders": { transport: "sse" },',
    );
    expect(readFileSync(join(root, PROXY), "utf8")).toBe(proxy);
  }, 60_000);
});
