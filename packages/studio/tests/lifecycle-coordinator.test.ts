/**
 * How Studio's managed mocks follow the config and the developer's commands.
 *
 * `autoStart` starts a mock when its definition is first read, or when an edit
 * turns it on — never again because the config reloaded. A running mock
 * restarts on an edit, and keeps serving through an edit that breaks its
 * definition. Commands for one mock take effect in the order they were given.
 * A mock removed from the config leaves the UI once it has stopped, and comes
 * back when it is declared again. After close, no mock starts.
 */
import type { CourierConfig } from "@noverax/courier/config";
import { courier, defineApi } from "@noverax/courier/define";
import { defineMockServer } from "@noverax/courier-mock/managed";
import type { Namespace } from "socket.io";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProcessManagerEvents, SpawnRequest } from "../src/server/mock-manager/process-manager";

const fake = {
  events: undefined as ProcessManagerEvents | undefined,
  children: new Map<string, SpawnRequest>(),
  spawned: [] as SpawnRequest[],
  killDelay: 0,
};

vi.mock("../src/server/mock-manager/port-allocator", () => ({
  allocatePort: async (preferred: number) => preferred,
}));

vi.mock("../src/server/mock-manager/process-manager", () => ({
  createProcessManager: (events: ProcessManagerEvents) => {
    fake.events = events;
    const kill = async (serverId: string) => {
      if (!fake.children.has(serverId)) return;
      await new Promise((resolve) => setTimeout(resolve, fake.killDelay));
      fake.children.delete(serverId);
    };
    return {
      spawn(request: SpawnRequest) {
        fake.spawned.push(request);
        fake.children.set(request.serverId, request);
        setTimeout(() => {
          if (fake.children.get(request.serverId) !== request) return;
          const url = `http://localhost:${request.port}`;
          events.onReady(request.serverId, { port: request.port, url, routes: [], collections: [], scenarios: [] });
        }, 2);
        return { pid: 1 };
      },
      kill,
      dispose: async () => {
        await Promise.all([...fake.children.keys()].map(kill));
      },
      has: (serverId: string) => fake.children.has(serverId),
      sendCommand: vi.fn(),
    };
  },
}));

const { createLifecycleCoordinator } = await import("../src/server/mock-manager/lifecycle-coordinator");
const { createMockRegistry } = await import("../src/server/mock-registry");

const { endpoint } = courier();
const api = defineApi({ baseURL: "https://api.example", endpoints: { ping: endpoint.get("ping") } });

type Emitted = { type: string; serverId: string; processStatus?: string; lastError?: string | null; port?: number };

function studio() {
  const emit = vi.fn();
  const registry = createMockRegistry();
  const coordinator = createLifecycleCoordinator({
    mockRegistry: registry,
    getConfigPath: () => "/p/courier.config.ts",
    basePort: 7001,
    uiNamespace: { emit } as unknown as Namespace,
  });
  const emitted = (): Emitted[] => emit.mock.calls.map(([, event]) => event as Emitted);
  const last = (serverId: string) =>
    emitted()
      .filter((e) => e.serverId === serverId && e.type === "mock:server:connect")
      .at(-1);
  const declare = (mocks: Record<string, unknown>) =>
    registry.syncFromConfig({ mocks } as unknown as CourierConfig);
  return { coordinator, registry, emitted, last, declare };
}

const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  fake.children.clear();
  fake.spawned.length = 0;
  fake.killDelay = 0;
});

describe("autoStart", () => {
  it("starts a mock once, and not again on a reload after the developer stopped it", async () => {
    const { coordinator, declare, last } = studio();
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await settle();
    expect(last("a")?.processStatus).toBe("running");

    coordinator.handleCommand("mock:managed:stop", { serverId: "a" });
    await settle();
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await settle();

    expect(last("a")?.processStatus).toBe("stopped");
    expect(fake.spawned).toHaveLength(1);
    await coordinator.stop();
  });

  it("starts a mock when an edit turns it on", async () => {
    const { coordinator, declare, last } = studio();
    declare({ a: defineMockServer({ source: api }) });
    await settle();
    expect(fake.spawned).toHaveLength(0);

    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await settle();

    expect(last("a")?.processStatus).toBe("running");
    await coordinator.stop();
  });
});

describe("a config edit", () => {
  it("restarts a running mock with the new definition", async () => {
    const { coordinator, declare, last } = studio();
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await settle();

    declare({ a: defineMockServer({ source: api, autoStart: true, port: 7555 }) });
    await settle();

    expect(fake.spawned.map((s) => s.port)).toEqual([7001, 7555]);
    expect(last("a")?.processStatus).toBe("running");
    await coordinator.stop();
  });

  it("that breaks a running mock's definition leaves it serving, and the fix restarts it", async () => {
    const { coordinator, declare, last } = studio();
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await settle();

    declare({ a: { broken: true } });
    await settle();
    expect(last("a")).toMatchObject({ processStatus: "running" });
    expect(last("a")?.lastError).toMatch(/keeps serving its last working definition/);
    expect(fake.children.has("a")).toBe(true);

    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await settle();
    expect(fake.spawned).toHaveLength(2);
    expect(last("a")).toMatchObject({ processStatus: "running", lastError: null });
    await coordinator.stop();
  });
});

describe("commands for one mock", () => {
  it("leave it stopped when a stop follows a restart", async () => {
    const { coordinator, declare, last } = studio();
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await settle();
    fake.killDelay = 20;

    coordinator.handleCommand("mock:managed:restart", { serverId: "a" });
    coordinator.handleCommand("mock:managed:stop", { serverId: "a" });
    await settle(120);

    expect(fake.children.has("a")).toBe(false);
    expect(last("a")?.processStatus).toBe("stopped");
    await coordinator.stop();
  });

  it("leave nothing running when a stop follows a start at once", async () => {
    const { coordinator, declare, last } = studio();
    declare({ a: defineMockServer({ source: api }) });
    await settle();

    coordinator.handleCommand("mock:managed:start", { serverId: "a" });
    coordinator.handleCommand("mock:managed:stop", { serverId: "a" });
    await settle();

    expect(fake.children.has("a")).toBe(false);
    expect(last("a")?.processStatus).toBe("stopped");
    await coordinator.stop();
  });

  it("start one worker, however often start is sent", async () => {
    const { coordinator, declare } = studio();
    declare({ a: defineMockServer({ source: api }) });
    await settle();

    coordinator.handleCommand("mock:managed:start", { serverId: "a" });
    coordinator.handleCommand("mock:managed:start", { serverId: "a" });
    await settle();

    expect(fake.spawned).toHaveLength(1);
    await coordinator.stop();
  });
});

describe("a mock removed from the config", () => {
  it("leaves the UI once it has stopped", async () => {
    const { coordinator, declare, emitted } = studio();
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await settle();

    declare({});
    await settle();

    const trail = emitted()
      .filter((e) => e.serverId === "a")
      .map((e) => (e.type === "mock:server:disconnect" ? "gone" : e.processStatus));
    expect(trail.slice(-3)).toEqual(["stopping", "stopped", "gone"]);
    await coordinator.stop();
  });

  it("comes back when it is declared again while it was stopping", async () => {
    const { coordinator, declare, last } = studio();
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await settle();
    fake.killDelay = 20;

    declare({});
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await settle(120);

    expect(last("a")?.processStatus).toBe("running");
    expect(fake.children.has("a")).toBe(true);
    await coordinator.stop();
  });
});

describe("after Studio closes", () => {
  it("starts no mock from a config that loads late", async () => {
    const { coordinator, declare } = studio();
    await coordinator.stop();

    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await settle();

    expect(fake.spawned).toHaveLength(0);
  });

  it("starts no mock whose description was underway", async () => {
    const { coordinator, declare } = studio();
    declare({ a: defineMockServer({ source: api, autoStart: true }) });

    await coordinator.stop();
    await settle();

    expect(fake.spawned).toHaveLength(0);
  });

  it("lets no restart that was underway fork a worker", async () => {
    const { coordinator, declare } = studio();
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await settle();
    fake.killDelay = 20;

    coordinator.handleCommand("mock:managed:restart", { serverId: "a" });
    await coordinator.stop();
    await settle();

    expect(fake.spawned).toHaveLength(1);
    expect(fake.children.size).toBe(0);
  });
});

describe("what the UI is told", () => {
  it("leaves the request and error counts to the UI's own tally", async () => {
    const { coordinator, declare, last } = studio();
    declare({ a: defineMockServer({ source: api }) });
    await settle();

    expect(last("a")).not.toHaveProperty("requestsServed");
    expect(last("a")).not.toHaveProperty("errorCount");
    await coordinator.stop();
  });

  it("drops the port and address a stopped mock listened on", async () => {
    const { coordinator, declare, last } = studio();
    declare({ a: defineMockServer({ source: api, autoStart: true, port: 7444 }) });
    await settle();
    coordinator.handleCommand("mock:managed:stop", { serverId: "a" });
    await settle();

    declare({ a: defineMockServer({ source: api, port: 7445 }) });
    await settle();

    expect(last("a")).toMatchObject({ port: 7445, url: "" });
    await coordinator.stop();
  });
});
