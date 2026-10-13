/**
 * The routes an editor's live views use: the requests Studio recorded,
 * newest first — the failed ones, or one endpoint's, when asked, a webhook
 * delivered to the app left out — and the mocks, a scenario switched and a
 * delay or faults set by Studio's presets, or stopped. The two that change
 * a mock need Studio's token.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { registerEditorLiveRoutes } from "../../src/server/editor/editor-live-routes";
import type { StudioMocks } from "../../src/server/mcp/mock-tools";
import type { ServerState } from "../../src/server/mock-manager/types";
import { requiresToken } from "../../src/server/token-guard";

const start = (id: string, at: number, method = "place", mode = "direct") => ({
  type: "request:start",
  id,
  source: "shop",
  group: "orders",
  method,
  httpMethod: "POST",
  mode,
  timestamp: at,
});
const EVENTS = [
  start("r1", 1),
  { type: "request:end", requestId: "r1", status: 201, timing: { total: 20 } },
  start("r2", 2),
  {
    type: "request:error",
    requestId: "r2",
    status: 500,
    error: { type: "http", status: 500, message: "Ledger unavailable" },
    timing: { total: 40 },
  },
  start("r3", 3, "cancel"),
  start("w1", 4, "place", "webhook"),
];

const STATE = {
  serverId: "shop",
  name: "shop",
  source: "shop",
  status: "running",
  url: "http://localhost:7101",
  scenarios: [{ name: "empty", description: "No products" }, { name: "default" }],
  activeScenario: "default",
  latencyPreset: "none",
  chaosPreset: "none",
  networkConfig: {
    stopConditions: { enabled: true },
    routeOverrides: [{ path: "/a", enabled: true }],
  },
} as unknown as ServerState;

const forwardStoreCommand = vi.fn((command: { serverId: string }) =>
  command.serverId === "shop" ? Promise.resolve({ ok: true }) : undefined,
);
const mocks = { describeServers: () => [STATE], forwardStoreCommand } as unknown as StudioMocks;

let server: Server;
let base: string;

async function post(path: string, body: unknown = {}) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerEditorLiveRoutes(app, { requestLog: { keyEvents: () => EVENTS }, mocks });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

describe("the requests an editor lists", () => {
  it("lists them newest first, each with its source and call apart, a webhook left out", async () => {
    const { body } = await post("/api/editor/requests");

    expect(body.requests).toEqual([
      expect.objectContaining({
        id: "r3",
        source: "shop",
        endpoint: "orders.cancel",
        state: "pending",
      }),
      expect.objectContaining({
        id: "r2",
        endpoint: "orders.place",
        state: "error",
        status: 500,
        durationMs: 40,
        error: "Ledger unavailable",
      }),
      expect.objectContaining({ id: "r1", state: "success", status: 201, durationMs: 20 }),
    ]);
  });

  it("keeps to the failed ones, or one endpoint's, and to fewer, when asked", async () => {
    const failed = await post("/api/editor/requests", { failed: true });
    const place = await post("/api/editor/requests", { source: "shop", endpoint: "orders.place" });
    const one = await post("/api/editor/requests", { limit: 1 });

    expect((failed.body.requests as { id: string }[]).map((each) => each.id)).toEqual(["r2"]);
    expect((place.body.requests as { id: string }[]).map((each) => each.id)).toEqual(["r2", "r1"]);
    expect(one.body.requests).toHaveLength(1);
  });
});

describe("the mocks an editor lists and switches", () => {
  it("lists each mock, its scenarios and the one in force", async () => {
    const { body } = await post("/api/editor/mocks");

    expect(body.mocks).toEqual([
      {
        id: "shop",
        name: "shop",
        source: "shop",
        status: "running",
        url: "http://localhost:7101",
        scenarios: [{ name: "empty", description: "No products" }, { name: "default" }],
        activeScenario: "default",
        latency: "none",
        chaos: "none",
      },
    ]);
  });

  it("switches a mock's scenario, and says when Studio runs no such mock", async () => {
    forwardStoreCommand.mockClear();

    const switched = await post("/api/editor/mocks/scenario", { mock: "shop", scenario: "empty" });
    const unknown = await post("/api/editor/mocks/scenario", {
      mock: "billing",
      scenario: "empty",
    });

    expect(switched).toEqual({ status: 200, body: { mock: "shop", activeScenario: "empty" } });
    expect(forwardStoreCommand).toHaveBeenCalledWith({
      action: "mock:scenario:apply",
      serverId: "shop",
      scenario: "empty",
    });
    expect(unknown.status).toBe(404);
  });

  it("sets a delay and faults by Studio's presets, the stop conditions kept, and stops both", async () => {
    forwardStoreCommand.mockClear();

    await post("/api/editor/mocks/conditions", { mock: "shop", latency: "3g", chaos: "degraded" });
    const [latency, chaos] = forwardStoreCommand.mock.calls.map(([command]) => command);
    forwardStoreCommand.mockClear();
    await post("/api/editor/mocks/conditions", { mock: "shop", stop: true });
    const stopped = forwardStoreCommand.mock.calls.map(([command]) => command);

    expect(latency).toEqual({
      action: "mock:network:set",
      serverId: "shop",
      config: { latency: { distribution: "log-normal", min: 300, max: 900, jitter: 150 } },
      preset: "3g",
    });
    expect(chaos).toMatchObject({
      action: "mock:chaos:set",
      config: { errorRate: 0.1, stopConditions: { enabled: true } },
      preset: "degraded",
    });
    expect(stopped).toEqual([
      expect.objectContaining({
        action: "mock:network:set",
        config: {
          latency: 0,
          bandwidth: 0,
          uploads: {},
          routeOverrides: [{ path: "/a", enabled: false }],
        },
      }),
      expect.objectContaining({
        action: "mock:chaos:set",
        config: { errorRate: 0, faultWeights: [] },
      }),
    ]);
  });

  it("refuses a preset Studio does not have", async () => {
    expect(
      (await post("/api/editor/mocks/conditions", { mock: "shop", latency: "dial-up" })).status,
    ).toBe(400);
  });

  it("needs Studio's token to change a mock", () => {
    expect(requiresToken("/api/editor/mocks/scenario")).toBe(true);
    expect(requiresToken("/api/editor/mocks/conditions")).toBe(true);
    expect(requiresToken("/api/editor/mocks")).toBe(false);
  });
});
