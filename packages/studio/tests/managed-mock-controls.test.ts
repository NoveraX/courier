/**
 * A managed mock driven by the controls in Studio's Mocks view: the real
 * worker, sent the commands the Network view and the status bar send.
 *
 * Each control changes only what it names. Picking a latency preset or
 * setting a per-route override used to merge `undefined` over every other
 * setting, so an active chaos preset stopped failing requests while the
 * Network view still showed it on.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProcessManager, type ProcessManagerEvents } from "../src/server/mock-manager/process-manager";

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
      "const users = defineGroup({ prefix: \"users\", endpoints: {\n" +
      '  list: endpoint.get("").response(z.array(User)),\n' +
      '  get: endpoint.get(":id").response(User),\n' +
      "} });\n" +
      "const live = defineGroup({ prefix: \"live\", endpoints: {\n" +
      '  ticker: stream.response(z.object({ n: z.number() })).get("stream"),\n' +
      "} });\n" +
      'export const api = defineApi({ baseURL: "https://api.example", groups: { users, live } });\n',
  );
  writeFileSync(
    join(root, "courier.mocks.ts"),
    'import { defineMocks, defineMockServer } from "@noverax/courier-mock";\n' +
      'import { api } from "./api";\n' +
      "export default defineMocks({ apiMock: defineMockServer({ source: api, log: \"silent\", seed: { count: 3 },\n" +
      '  overrides: (mock) => { mock("live", "ticker").emits([{ data: { n: 1 } }, { data: { n: 2 } }]); },\n' +
      "}) });\n",
  );
  return join(root, "courier.mocks.ts");
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

type SentEvent = Record<string, unknown>;

async function startMock() {
  const events = {
    onReady: vi.fn(),
    onError: vi.fn(),
    onStopped: vi.fn(),
    onExited: vi.fn(),
    onEvent: vi.fn<(serverId: string, event: SentEvent) => void>(),
  } satisfies ProcessManagerEvents;
  const pm = createProcessManager(events, { transformCacheDirectory: () => null });
  cleanups.push(() => pm.dispose());
  const port = await freePort();
  pm.spawn({ serverId: "apiMock", mocksFile: project(), mockKey: "apiMock", port });
  await vi.waitFor(() => expect(events.onReady).toHaveBeenCalled(), { timeout: 15_000 });

  /** Send a command and wait for the network config event it answers with. */
  async function command(action: string, payload: Record<string, unknown>): Promise<SentEvent> {
    const before = networkEvents().length;
    pm.sendCommand("apiMock", { action, ...payload });
    await vi.waitFor(() => expect(networkEvents().length).toBeGreaterThan(before), { timeout: 5_000 });
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
  /** Send a store command and wait for the store snapshot it answers with. */
  async function storeCommand(action: string, payload: Record<string, unknown> = {}): Promise<SentEvent> {
    const snapshots = () => events.onEvent.mock.calls.filter(([, event]) => event.type === "mock:store:snapshot");
    const before = snapshots().length;
    pm.sendCommand("apiMock", { action, ...payload });
    await vi.waitFor(() => expect(snapshots().length).toBeGreaterThan(before), { timeout: 5_000 });
    return snapshots().at(-1)?.[1] ?? {};
  }
  return { command, storeCommand, statuses, events, url: `http://127.0.0.1:${port}` };
}

const DOWN = { errorRate: 1, faultWeights: [{ type: "503", weight: 100 }] };

describe("the network controls of a managed mock", () => {
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
    await mock.command("mock:network:set", { config: { latency: { min: 20, max: 30 } }, preset: "3g" });

    const override = { routeId: "users:get", enabled: true, latency: { min: 0, max: 0 }, errorRate: 0 };
    const event = await mock.command("mock:network:set", { config: { routeOverrides: [override] } });

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
    await mock.command("mock:network:set", { config: { latency: { min: 20, max: 30 } }, preset: "3g" });

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
    await mock.storeCommand("mock:store:create", { collection: "users", record: { name: "Extra" } });
    await mock.command("mock:chaos:set", { config: DOWN, preset: "down" });
    const networkEvents = () =>
      mock.events.onEvent.mock.calls.filter(([, event]) => event.type === "mock:network:config").length;
    const before = networkEvents();

    const snapshot = await mock.storeCommand("mock:server:reset");

    expect(snapshot.collections).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "users", count: 3 })]),
    );
    expect(await mock.statuses("/users", 3)).toEqual([503, 503, 503]);
    expect(networkEvents()).toBe(before);
  }, 30_000);
});
