/**
 * The routes an editor reads Studio through: how each endpoint's calls went
 * — a webhook delivered to the app left out — the endpoint calls in a file
 * the editor sends, where the project's code calls one endpoint, files
 * Git ignores and dependencies left out, and where its files declare each
 * endpoint. And the file in `.courier` that tells an editor where Studio
 * runs, there only while it does.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { registerEditorRoutes } from "../../src/server/editor/editor-routes";
import { studioAddressFile } from "../../src/server/editor/studio-address-file";

const { endpoint, stream } = courier();
const shop = defineApi({
  baseURL: "https://shop.example",
  groups: {
    orders: defineGroup({
      prefix: "orders",
      endpoints: {
        place: endpoint.post("").response(z.object({ id: z.string() })),
        cancel: endpoint.post(":id/cancel").variables(z.object({ id: z.string() })),
      },
    }),
    live: defineGroup({
      prefix: "live",
      endpoints: { orders: stream.response(z.object({ id: z.string() })).get("orders") },
    }),
  },
});
const opened = (requestId: string, at: number) => ({
  type: "stream:open",
  requestId,
  source: "shop",
  group: "live",
  method: "orders",
  transport: "sse",
  timestamp: at,
});
const call = (id: string, at: number, mode = "direct") => ({
  type: "request:start",
  id,
  source: "shop",
  group: "orders",
  method: "place",
  mode,
  timestamp: at,
});
const EVENTS = [
  call("r1", 1),
  { type: "request:end", requestId: "r1", status: 201, timing: { total: 20 } },
  call("r2", 2),
  {
    type: "request:error",
    requestId: "r2",
    status: 500,
    error: { type: "http", status: 500, message: "Ledger unavailable" },
    timing: { total: 40 },
  },
  call("r3", 3),
  call("w1", 4, "webhook"),
  opened("s1", 5),
  opened("s1", 6),
  { type: "stream:close", requestId: "s1", reason: "disconnect" },
  opened("s2", 7),
  opened("s3", 8),
  { type: "stream:error", requestId: "s3", error: "Upstream closed the stream" },
];

let root: string;
let gitRoot: string;
let server: Server;
let base: string;

/* Only what the routes read of a loaded project: its sources, and the config that declares them. */
const project = {
  snapshot: () =>
    ({
      running: { config: { sources: { shop } }, configFile: join(root, "courier.config.ts") },
    }) as never,
};

const CONFIG = `import { shop } from "./src/shop";

export default { sources: { shop } };
`;

const SHOP = `export const shop = defineApi({
  groups: {
    orders: defineGroup({
      endpoints: {
        place: endpoint.post(""),
        cancel: endpoint.post(":id/cancel"),
      },
    }),
  },
});
`;

async function studioAt(projectRoot: string): Promise<string> {
  const app = express();
  app.use(express.json());
  registerEditorRoutes(app, {
    project,
    requestLog: { events: () => EVENTS, keyEvents: () => EVENTS, version: () => 0 },
    root: projectRoot,
  });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function post(
  path: string,
  body: unknown = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "courier-editor-"));
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "node_modules/kit"), { recursive: true });
  writeFileSync(
    join(root, "src/checkout.ts"),
    "export async function pay() {\n  return api.orders.place({});\n}\n",
  );
  writeFileSync(join(root, "node_modules/kit/index.ts"), "api.orders.place({});\n");
  writeFileSync(join(root, "courier.config.ts"), CONFIG);
  writeFileSync(join(root, "src/shop.ts"), SHOP);
  base = await studioAt(root);
});

afterAll(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
  if (gitRoot) rmSync(gitRoot, { recursive: true, force: true });
});

describe("the editor routes", () => {
  it("tell how each endpoint's calls went — a stream's connections for its calls — one never called included and a webhook left out", async () => {
    const { body } = await post("/api/editor/endpoints");

    expect(body.endpoints).toEqual([
      {
        source: "shop",
        endpoint: "orders.place",
        kind: "mutation",
        calls: 3,
        requests: 3,
        failed: 1,
        pending: 1,
        statuses: { "201": 1, "500": 1 },
        p50: 20,
        p95: 40,
        lastAt: 3,
        lastFailure: { at: 2, status: 500, message: "Ledger unavailable", request: "r2" },
      },
      {
        source: "shop",
        endpoint: "orders.cancel",
        kind: "mutation",
        calls: 0,
        requests: 0,
        failed: 0,
        pending: 0,
        statuses: {},
      },
      {
        source: "shop",
        endpoint: "live.orders",
        kind: "stream",
        calls: 3,
        requests: 3,
        failed: 1,
        pending: 1,
        statuses: {},
        lastAt: 8,
        lastFailure: { at: 8, message: "Upstream closed the stream", request: "s3" },
      },
    ]);
  });

  it("place the endpoint calls in a file the editor sends, unsaved changes and all", async () => {
    const { body } = await post("/api/editor/calls", {
      file: "/work/cart.ts",
      text: "// draft\nawait api.orders.cancel({ id });\n",
    });

    expect(body.calls).toEqual([
      {
        line: 2,
        column: 18,
        endLine: 2,
        endColumn: 24,
        endpoints: [{ source: "shop", endpoint: "orders.cancel" }],
      },
    ]);
  });

  it("say where the project calls an endpoint, outside its dependencies", async () => {
    const { body } = await post("/api/editor/sites", { source: "shop", endpoint: "orders.place" });

    expect(body.sites).toEqual([
      {
        file: "src/checkout.ts",
        path: join(root, "src/checkout.ts"),
        line: 2,
        column: 21,
        endLine: 2,
        endColumn: 26,
        code: "return api.orders.place({});",
      },
    ]);
  });

  it("say where the project's files declare each endpoint, and nothing of one built elsewhere", async () => {
    const { body } = await post("/api/editor/definitions");

    expect(body.definitions).toEqual([
      expect.objectContaining({
        source: "shop",
        endpoint: "orders.place",
        file: "src/shop.ts",
        line: 5,
        column: 9,
      }),
      expect.objectContaining({ endpoint: "orders.cancel", line: 6, column: 9 }),
    ]);
  });

  it("leave out what Git ignores, in a repository", async () => {
    gitRoot = mkdtempSync(join(tmpdir(), "courier-editor-git-"));
    mkdirSync(join(gitRoot, "generated"), { recursive: true });
    writeFileSync(join(gitRoot, ".gitignore"), "generated/\n");
    writeFileSync(join(gitRoot, "app.ts"), "api.orders.place({});\n");
    writeFileSync(join(gitRoot, "generated/client.ts"), "api.orders.place({});\n");
    execFileSync("git", ["init", "--quiet"], { cwd: gitRoot });
    server.close();
    base = await studioAt(gitRoot);

    const { body } = await post("/api/editor/sites", { source: "shop", endpoint: "orders.place" });

    expect((body.sites as { file: string }[]).map((site) => site.file)).toEqual(["app.ts"]);
  });

  it("refuse a request that names no file or no endpoint", async () => {
    expect((await post("/api/editor/calls", { file: "a.ts" })).status).toBe(400);
    expect((await post("/api/editor/sites", { source: "shop" })).status).toBe(400);
  });
});

describe("the file that tells an editor where Studio runs", () => {
  it("is written once Studio listens and taken away when it stops — only while it is this Studio's", () => {
    const project = mkdtempSync(join(tmpdir(), "courier-address-"));
    const file = join(project, ".courier/studio.json");
    const next = vi.fn();
    const address = studioAddressFile(() => project, true);

    address.announcing(next)("http://localhost:6280");
    const written = JSON.parse(readFileSync(file, "utf8"));
    address.forget();
    const gone = !existsSync(file);
    writeFileSync(file, JSON.stringify({ url: "http://localhost:6281", pid: -1 }));
    address.forget();

    expect(written).toMatchObject({ url: "http://localhost:6280", pid: process.pid });
    expect(next).toHaveBeenCalledWith("http://localhost:6280");
    expect(gone).toBe(true);
    expect(existsSync(file)).toBe(true);
    rmSync(project, { recursive: true, force: true });
  });

  it("is never written for a public demo, nor into a `.courier` that is no folder", () => {
    const project = mkdtempSync(join(tmpdir(), "courier-address-"));

    studioAddressFile(() => project, false).announcing(undefined)("http://localhost:6280");

    writeFileSync(join(project, ".courier"), "not a folder");
    const refused = studioAddressFile(() => project, true);
    refused.announcing(undefined)("http://localhost:6280");
    refused.forget();

    expect(existsSync(join(project, ".courier/studio.json"))).toBe(false);
    rmSync(project, { recursive: true, force: true });
  });
});
