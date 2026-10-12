/**
 * A managed mock driven by the controls in Studio's Mocks view: the real
 * worker, sent the commands the Network view and the status bar send.
 *
 * Each control changes only what it names: picking a latency preset or
 * setting a per-route override leaves every other setting as it is, so an
 * active chaos preset goes on failing requests as the Network view shows.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type ChildReadyData,
  createProcessManager,
  type ProcessManagerEvents,
} from "../src/server/mock-manager/process-manager";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A project under the repository's node_modules, so its files resolve the workspace packages. */
function project(): string {
  const cache = join(__dirname, "../../../node_modules/.cache/courier-studio-tests");
  mkdirSync(cache, { recursive: true });
  const root = mkdtempSync(join(cache, "controls "));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, "api.ts"),
    'import { courier, defineApi, defineGroup } from "@noverax/courier/define";\n' +
      'import { z } from "zod";\n' +
      "const { endpoint, stream } = courier();\n" +
      "const User = z.object({ id: z.number(), name: z.string() });\n" +
      'const users = defineGroup({ prefix: "users", endpoints: {\n' +
      '  list: endpoint.get("").response(z.array(User)),\n' +
      '  get: endpoint.get(":id").response(User),\n' +
      "} });\n" +
      'const live = defineGroup({ prefix: "live", endpoints: {\n' +
      '  ticker: stream.response(z.object({ n: z.number() })).get("stream"),\n' +
      "} });\n" +
      'export const api = defineApi({ baseURL: "https://api.example", groups: { users, live } });\n',
  );
  writeFileSync(
    join(root, "courier.mocks.ts"),
    'import { defineMocks, defineMockServer } from "@noverax/courier-mock";\n' +
      'import { api } from "./api";\n' +
      'export default defineMocks({ apiMock: defineMockServer({ source: api, log: "silent", seed: { count: 3 },\n' +
      '  overrides: (mock) => { mock("live", "ticker").emits([{ data: { n: 1 } }, { data: { n: 2 } }]); },\n' +
      "}) });\n",
  );
  return join(root, "courier.mocks.ts");
}

type SentEvent = Record<string, unknown>;

async function startMock() {
  const events = {
    onReady: vi.fn<(serverId: string, data: ChildReadyData) => void>(),
    onError: vi.fn<(serverId: string, message: string, fatal: boolean) => void>(),
    onStopped: vi.fn(),
    onExited: vi.fn<(serverId: string, reason: string) => void>(),
    onEvent: vi.fn<(serverId: string, event: SentEvent) => void>(),
  } satisfies ProcessManagerEvents;
  const pm = createProcessManager(events, {
    transformCacheDirectory: () => null,
    storeFile: () => null,
  });
  cleanups.push(() => pm.dispose());
  /* Port 0: the system picks one as the worker binds, which no other test can take in between. */
  pm.spawn({
    serverId: "apiMock",
    mocksFile: project(),
    mockKey: "apiMock",
    port: 0,
    strictPort: true,
    avoidPorts: [],
  });
  /* Ready, or why not: a start that failed says so at once, not when the wait runs out. */
  const failed = () => [
    ...events.onError.mock.calls.filter(([, , fatal]) => fatal).map(([, message]) => message),
    ...events.onExited.mock.calls.map(([, why]) => why),
  ];
  await vi.waitFor(
    () => expect(events.onReady.mock.calls.length + failed().length).toBeGreaterThan(0),
    { timeout: 15_000 },
  );
  expect(failed()).toEqual([]);
  const port = events.onReady.mock.calls[0]?.[1].port;

  /** Send a command and wait for the network config event it answers with. */
  async function command(action: string, payload: Record<string, unknown>): Promise<SentEvent> {
    const before = networkEvents().length;
    pm.sendCommand("apiMock", { action, ...payload });
    await vi.waitFor(() => expect(networkEvents().length).toBeGreaterThan(before), {
      timeout: 5_000,
    });
    return networkEvents().at(-1) ?? {};
  }
  function networkEvents(): SentEvent[] {
    return events.onEvent.mock.calls
      .map(([, event]) => event)
      .filter((event) => event.type === "mock:network:config");
  }
  async function statuses(path: string, count: number): Promise<number[]> {
    const replies = await Promise.all(
      Array.from({ length: count }, () => fetch(`http://127.0.0.1:${port}${path}`)),
    );
    return replies.map((reply) => reply.status);
  }
  /** Send a store command and wait for the report of the store's changes it answers with. */
  async function storeCommand(
    action: string,
    payload: Record<string, unknown> = {},
  ): Promise<SentEvent> {
    const reports = () =>
      events.onEvent.mock.calls.filter(([, event]) => event.type === "mock:store:changes");
    const before = reports().length;
    pm.sendCommand("apiMock", { action, ...payload });
    await vi.waitFor(() => expect(reports().length).toBeGreaterThan(before), { timeout: 5_000 });
    return reports().at(-1)?.[1] ?? {};
  }
  return { command, storeCommand, statuses, events, pm, url: `http://127.0.0.1:${port}` };
}

const DOWN = { errorRate: 1, faultWeights: [{ type: "503", weight: 100 }] };

/** The request starts a mock reported, in order. */
function starts(mock: Awaited<ReturnType<typeof startMock>>): SentEvent[] {
  return mock.events.onEvent.mock.calls
    .map(([, event]) => event)
    .filter((event) => event.type === "mock:request:start");
}

describe("the network controls of a managed mock", () => {
  it("names what answered each request as it arrived", async () => {
    const mock = await startMock();
    await fetch(`${mock.url}/users`);

    mock.pm.sendCommand("apiMock", { action: "mock:scenario:apply", scenario: "server-error" });
    await vi.waitFor(async () => expect((await fetch(`${mock.url}/users`)).status).toBe(500), {
      timeout: 5_000,
    });

    const sources = starts(mock).map((event) => event.source);
    expect(sources[0]).toBe("auto");
    expect(sources.at(-1)).toBe("scenario");
  }, 30_000);

  it("says how long a run lasted when it stops", async () => {
    const mock = await startMock();
    await mock.command("mock:chaos:set", { config: DOWN, preset: "down" });
    await new Promise((resolve) => setTimeout(resolve, 250));

    await mock.command("mock:chaos:set", {
      config: { errorRate: 0, faultWeights: [] },
      preset: "none",
    });

    const runs = mock.events.onEvent.mock.calls
      .map(([, event]) => event)
      .filter((event) => event.type === "mock:experiment:event");
    expect(runs.map((event) => [event.eventType, event.mode])).toEqual([
      ["started", "down"],
      ["stopped", "down"],
    ]);
    expect(runs[0]).not.toHaveProperty("durationMs");
    expect(runs[1]?.durationMs).toBeGreaterThanOrEqual(200);
  }, 30_000);

  it("keeps the active chaos when a latency preset is picked", async () => {
    const mock = await startMock();
    await mock.command("mock:chaos:set", { config: DOWN, preset: "down" });
    expect(await mock.statuses("/users", 5)).toEqual([503, 503, 503, 503, 503]);

    const event = await mock.command("mock:network:set", {
      config: { latency: { min: 20, max: 30 } },
      preset: "3g",
    });

    expect(await mock.statuses("/users", 5)).toEqual([503, 503, 503, 503, 503]);
    expect(event.config).toMatchObject({ errorRate: 1, chaosPreset: "down", latencyPreset: "3g" });
  }, 30_000);

  it("keeps the global chaos and latency when a per-route override is set", async () => {
    const mock = await startMock();
    await mock.command("mock:chaos:set", { config: DOWN, preset: "down" });
    await mock.command("mock:network:set", {
      config: { latency: { min: 20, max: 30 } },
      preset: "3g",
    });

    const override = {
      routeId: "users:get",
      enabled: true,
      latency: { min: 0, max: 0 },
      errorRate: 0,
    };
    const event = await mock.command("mock:network:set", {
      config: { routeOverrides: [override] },
    });

    expect(await mock.statuses("/users", 5)).toEqual([503, 503, 503, 503, 503]);
    expect(await mock.statuses("/users/1", 3)).toEqual([200, 200, 200]);
    expect(event.config).toMatchObject({
      errorRate: 1,
      latency: { min: 20, max: 30 },
      chaosPreset: "down",
      latencyPreset: "3g",
    });
  }, 30_000);

  it("turns latency off without touching the chaos", async () => {
    const mock = await startMock();
    await mock.command("mock:chaos:set", { config: DOWN, preset: "down" });
    await mock.command("mock:network:set", {
      config: { latency: { min: 20, max: 30 } },
      preset: "3g",
    });

    const event = await mock.command("mock:network:set", {
      config: { latency: 0, bandwidth: 0 },
      preset: "none",
    });

    expect(event.config).toMatchObject({ latency: 0, errorRate: 1, latencyPreset: "none" });
    expect(await mock.statuses("/users", 3)).toEqual([503, 503, 503]);
  }, 30_000);
});

describe("the Reset store control of a managed mock", () => {
  it("reseeds the store and leaves the network settings as they are", async () => {
    const mock = await startMock();
    await mock.storeCommand("mock:store:create", {
      collection: "users",
      record: { name: "Extra" },
    });
    await mock.command("mock:chaos:set", { config: DOWN, preset: "down" });
    const networkEvents = () =>
      mock.events.onEvent.mock.calls.filter(([, event]) => event.type === "mock:network:config")
        .length;
    const before = networkEvents();

    const report = await mock.storeCommand("mock:server:reset");

    expect(report.collections).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "users", count: 3 })]),
    );
    expect(await mock.statuses("/users", 3)).toEqual([503, 503, 503]);
    expect(networkEvents()).toBe(before);
  }, 30_000);
});

describe("the Store view's changes to a managed mock", () => {
  it("are answered with whether the mock made them, and what it made", async () => {
    const mock = await startMock();

    const created = await mock.pm.sendCommand("apiMock", {
      action: "mock:store:create",
      collection: "users",
      record: { name: "Extra" },
    });
    const missing = await mock.pm.sendCommand("apiMock", {
      action: "mock:store:update",
      collection: "users",
      id: 999,
      data: { name: "Nobody" },
    });

    expect(created).toEqual({ ok: true, data: { id: 4, name: "Extra" } });
    expect(missing).toEqual({ ok: false, error: "users has no record with id 999" });
  }, 30_000);
});
