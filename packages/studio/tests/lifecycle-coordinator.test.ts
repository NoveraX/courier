/**
 * How Studio's managed mocks follow courier.mocks.ts and the developer's
 * commands.
 *
 * `autoStart` starts a mock when its definition is first read, or when an edit
 * turns it on — never again because the file reloaded. A running mock
 * restarts on an edit, and keeps serving through an edit that breaks its
 * definition, or the whole file. Commands for one mock take effect in the
 * order they were given. A mock removed from the file leaves the UI once it
 * has stopped, and comes back when it is declared again. After close, no mock
 * starts.
 */
import { courier, defineApi } from "@noverax/courier/define";
import { defineMockServer } from "@noverax/courier-mock/managed";
import type { Namespace, Socket } from "socket.io";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TOKEN_PAGES } from "../src/server/live-events";
import type {
  ProcessManagerEvents,
  ProcessManagerOptions,
} from "../src/server/mock-manager/process-manager";
import type { SpawnRequest } from "../src/server/mock-manager/types";

const fake = {
  events: undefined as ProcessManagerEvents | undefined,
  options: undefined as ProcessManagerOptions | undefined,
  children: new Map<string, SpawnRequest>(),
  spawned: [] as SpawnRequest[],
  killDelay: 0,
};

vi.mock("../src/server/mock-manager/port-allocator", () => ({
  allocatePort: async (preferred: number) => preferred,
}));

vi.mock("../src/server/mock-manager/process-manager", () => ({
  createProcessManager: (events: ProcessManagerEvents, options: ProcessManagerOptions) => {
    fake.events = events;
    fake.options = options;
    /* A worker asked to stop says it stopped, and then exits. */
    const kill = async (serverId: string) => {
      if (!fake.children.has(serverId)) return;
      await new Promise((resolve) => setTimeout(resolve, fake.killDelay));
      events.onStopped(serverId);
      fake.children.delete(serverId);
    };
    return {
      spawn(request: SpawnRequest) {
        fake.spawned.push(request);
        fake.children.set(request.serverId, request);
        setTimeout(() => {
          if (fake.children.get(request.serverId) !== request) return;
          const url = `http://localhost:${request.port}`;
          events.onReady(request.serverId, {
            port: request.port,
            url,
            routes: [],
            collections: [],
            scenarios: [],
          });
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

const { createLifecycleCoordinator } = await import(
  "../src/server/mock-manager/lifecycle-coordinator"
);
const { createMockRegistry } = await import("../src/server/mock-registry");

const { endpoint } = courier();
const api = defineApi({
  baseURL: "https://api.example",
  endpoints: { ping: endpoint.get("ping") },
});

type Emitted = {
  type: string;
  serverId: string;
  processStatus?: string;
  lastError?: string | null;
  port?: number;
  filePath?: string;
};

const MOCKS_FILE = "/p/courier.mocks.ts";
const STUDIO_TRANSFORMS = "/p/node_modules/.cache/courier/transform";

function studio() {
  const emit = vi.fn();
  const registry = createMockRegistry();
  const coordinator = createLifecycleCoordinator({
    mockRegistry: registry,
    basePort: () => 7001,
    /* The pages with the token, which see each event whole. */
    uiNamespace: {
      emit,
      to: (room: string) => ({ emit: room === TOKEN_PAGES ? emit : vi.fn() }),
    } as unknown as Namespace,
    transformCacheDirectory: () => STUDIO_TRANSFORMS,
    storeFile: () => null,
  });
  coordinator.setMocksFile({ file: MOCKS_FILE, error: null });
  const emitted = (): Emitted[] =>
    emit.mock.calls.filter(([name]) => name === "event").map(([, event]) => event as Emitted);
  const statuses = () =>
    emit.mock.calls.filter(([name]) => name === "mocks:status").map(([, status]) => status);
  const last = (serverId: string) =>
    emitted()
      .filter((e) => e.serverId === serverId && e.type === "mock:server:connect")
      .at(-1);
  const declare = (mocks: Record<string, unknown>) => registry.syncFromMocks(mocks);
  return { coordinator, registry, emitted, statuses, last, declare };
}

const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  fake.options = undefined;
  fake.children.clear();
  fake.spawned.length = 0;
  fake.killDelay = 0;
});

describe("autoStart", () => {
  it("starts a mock once, and not again on a reload after the developer stopped it", async () => {
    const { coordinator, declare, last } = studio();
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await vi.waitFor(() => expect(last("a")?.processStatus).toBe("running"));

    coordinator.handleCommand("mock:managed:stop", { serverId: "a" });
    await vi.waitFor(() => expect(last("a")?.processStatus).toBe("stopped"));
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

    await vi.waitFor(() => expect(last("a")?.processStatus).toBe("running"));
    await coordinator.stop();
  });
});

describe("an edit", () => {
  it("restarts a running mock with the new definition", async () => {
    const { coordinator, declare, last } = studio();
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await vi.waitFor(() => expect(last("a")?.processStatus).toBe("running"));

    declare({ a: defineMockServer({ source: api, autoStart: true, port: 7555 }) });

    await vi.waitFor(() => {
      expect(fake.spawned.map((s) => s.port)).toEqual([7001, 7555]);
      expect(last("a")?.processStatus).toBe("running");
    });
    await coordinator.stop();
  });

  it("that breaks a running mock's definition leaves it serving, and the fix restarts it", async () => {
    const { coordinator, declare, last } = studio();
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await vi.waitFor(() => expect(last("a")?.processStatus).toBe("running"));

    declare({ a: { broken: true } });
    await vi.waitFor(() =>
      expect(last("a")?.lastError).toMatch(/keeps serving its last working definition/),
    );
    expect(last("a")).toMatchObject({ processStatus: "running" });
    expect(fake.children.has("a")).toBe(true);

    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await vi.waitFor(() => {
      expect(fake.spawned).toHaveLength(2);
      expect(last("a")).toMatchObject({ processStatus: "running", lastError: null });
    });
    await coordinator.stop();
  });
});

describe("commands for one mock", () => {
  it("leave it stopped when a stop follows a restart", async () => {
    const { coordinator, declare, last } = studio();
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await vi.waitFor(() => expect(last("a")?.processStatus).toBe("running"));
    fake.killDelay = 20;

    coordinator.handleCommand("mock:managed:restart", { serverId: "a" });
    coordinator.handleCommand("mock:managed:stop", { serverId: "a" });
    await settle(120);

    await vi.waitFor(() => {
      expect(fake.children.has("a")).toBe(false);
      expect(last("a")?.processStatus).toBe("stopped");
    });
    await coordinator.stop();
  });

  it("leave nothing running when a stop follows a start at once", async () => {
    const { coordinator, declare, last } = studio();
    declare({ a: defineMockServer({ source: api }) });
    await settle();

    coordinator.handleCommand("mock:managed:start", { serverId: "a" });
    coordinator.handleCommand("mock:managed:stop", { serverId: "a" });
    await settle();

    await vi.waitFor(() => {
      expect(fake.children.has("a")).toBe(false);
      expect(last("a")?.processStatus).toBe("stopped");
    });
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

describe("a mock removed from the mocks file", () => {
  it("leaves the UI once it has stopped", async () => {
    const { coordinator, declare, emitted } = studio();
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await vi.waitFor(() =>
      expect(emitted().some((e) => e.serverId === "a" && e.processStatus === "running")).toBe(true),
    );

    declare({});

    const trail = () =>
      emitted()
        .filter((e) => e.serverId === "a")
        .map((e) => (e.type === "mock:server:disconnect" ? "gone" : e.processStatus));
    await vi.waitFor(() => expect(trail().slice(-3)).toEqual(["stopping", "stopped", "gone"]));
    await coordinator.stop();
  });

  it("comes back when it is declared again while it was stopping", async () => {
    const { coordinator, declare, last } = studio();
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await vi.waitFor(() => expect(last("a")?.processStatus).toBe("running"));
    fake.killDelay = 20;

    declare({});
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await settle(120);

    await vi.waitFor(() => {
      expect(last("a")?.processStatus).toBe("running");
      expect(fake.children.has("a")).toBe(true);
    });
    await coordinator.stop();
  });
});

describe("after Studio closes", () => {
  it("starts no mock from a mocks file that loads late", async () => {
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
    await vi.waitFor(() => expect(fake.children.has("a")).toBe(true));
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
    await vi.waitFor(() => expect(last("a")?.processStatus).toBe("running"));
    coordinator.handleCommand("mock:managed:stop", { serverId: "a" });
    await vi.waitFor(() => expect(last("a")?.processStatus).toBe("stopped"));

    declare({ a: defineMockServer({ source: api, port: 7445 }) });

    await vi.waitFor(() => expect(last("a")).toMatchObject({ port: 7445, url: "" }));
    await coordinator.stop();
  });

  it("tells each step of a restart once, and a restarting mock as restarting until it starts", async () => {
    const { coordinator, declare, emitted } = studio();
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await vi.waitFor(() =>
      expect(emitted().some((e) => e.serverId === "a" && e.processStatus === "running")).toBe(true),
    );
    const before = emitted().length;

    declare({ a: defineMockServer({ source: api, autoStart: true, port: 7556 }) });

    const steps = () =>
      emitted()
        .slice(before)
        .filter((e) => e.serverId === "a" && e.type === "mock:server:connect")
        .map((e) => e.processStatus);
    await vi.waitFor(() => expect(steps().at(-1)).toBe("running"));
    await settle();
    expect(steps()).toEqual(["running", "restarting", "starting", "running"]);
    await coordinator.stop();
  });

  it("tells a stop once it has stopped, and once", async () => {
    const { coordinator, declare, emitted } = studio();
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await vi.waitFor(() =>
      expect(emitted().some((e) => e.serverId === "a" && e.processStatus === "running")).toBe(true),
    );
    const before = emitted().length;

    coordinator.handleCommand("mock:managed:stop", { serverId: "a" });

    const steps = () =>
      emitted()
        .slice(before)
        .filter((e) => e.serverId === "a" && e.type === "mock:server:connect")
        .map((e) => e.processStatus);
    await vi.waitFor(() => expect(steps().at(-1)).toBe("stopped"));
    await settle();
    expect(steps()).toEqual(["stopping", "stopped"]);
    await coordinator.stop();
  });

  it("names the mock by its file and key", async () => {
    const { coordinator, declare, last } = studio();
    declare({ a: defineMockServer({ source: api }) });
    await settle();

    expect(last("a")?.filePath).toBe("courier.mocks.ts:a");
    await coordinator.stop();
  });
});

describe("a mocks file that fails to load", () => {
  it("keeps its mocks running, says why on each, and the next load that works clears it", async () => {
    const { coordinator, declare, last } = studio();
    declare({
      a: defineMockServer({ source: api, autoStart: true }),
      b: defineMockServer({ source: api }),
    });
    await vi.waitFor(() => expect(last("a")?.processStatus).toBe("running"));

    coordinator.setMocksFile({ file: MOCKS_FILE, error: "Unexpected token" });
    expect(last("a")).toMatchObject({ processStatus: "running" });
    expect(last("a")?.lastError).toBe(
      "courier.mocks.ts failed to load: Unexpected token. A running mock keeps serving its last working definition.",
    );
    expect(last("b")?.lastError).toMatch(/^courier\.mocks\.ts failed to load: Unexpected token\./);
    expect(fake.children.has("a")).toBe(true);

    coordinator.setMocksFile({ file: MOCKS_FILE, error: null });
    expect(last("a")?.lastError).toBeNull();
    expect(last("b")?.lastError).toBeNull();
    expect(fake.spawned).toHaveLength(1);
    await coordinator.stop();
  });

  it("leaves a reason of the mock's own in place when the file loads again", async () => {
    const { coordinator, declare, last } = studio();
    declare({ a: defineMockServer({ source: api, autoStart: true }) });
    await vi.waitFor(() => expect(last("a")?.processStatus).toBe("running"));

    coordinator.setMocksFile({ file: MOCKS_FILE, error: "Unexpected token" });
    fake.children.delete("a");
    fake.events?.onExited("a", "exited with code 1");
    coordinator.setMocksFile({ file: MOCKS_FILE, error: null });

    expect(last("a")).toMatchObject({ processStatus: "crashed", lastError: "exited with code 1" });
    await coordinator.stop();
  });

  it("registers a mock declared meanwhile from the file that last loaded", async () => {
    const { coordinator, declare, last } = studio();
    coordinator.setMocksFile({ file: "/p/courier.mocks.mts", error: "Unexpected token" });

    declare({ a: defineMockServer({ source: api }) });
    await settle();
    coordinator.handleCommand("mock:managed:start", { serverId: "a" });

    await vi.waitFor(() => expect(fake.spawned.map((s) => s.mocksFile)).toEqual([MOCKS_FILE]));
    expect(last("a")?.filePath).toBe("courier.mocks.ts:a");
    await coordinator.stop();
  });
});

describe("the mocks file's status", () => {
  it("is sent when it changes, and not again when it has not", () => {
    const { coordinator, statuses } = studio();

    coordinator.setMocksFile({ file: MOCKS_FILE, error: "Unexpected token" });
    coordinator.setMocksFile({ file: MOCKS_FILE, error: "Unexpected token" });
    coordinator.setMocksFile({ file: null, error: null });

    expect(statuses()).toEqual([
      { file: MOCKS_FILE, error: null },
      { file: MOCKS_FILE, error: "Unexpected token" },
      { file: null, error: null },
    ]);
  });

  it("is sent to the UI that connects, and to no other", () => {
    const { coordinator, statuses } = studio();
    coordinator.setMocksFile({ file: MOCKS_FILE, error: "Unexpected token" });
    const page = { emit: vi.fn(), rooms: new Set([TOKEN_PAGES]) };

    coordinator.sendSnapshot(page as unknown as Socket);

    expect(page.emit).toHaveBeenCalledWith("mocks:status", {
      file: MOCKS_FILE,
      error: "Unexpected token",
    });
    expect(statuses()).toHaveLength(2);
  });

  it("gives the page that connects each mock's state, leaving the open pages alone", async () => {
    const { coordinator, declare, emitted } = studio();
    declare({ a: defineMockServer({ source: api }) });
    await vi.waitFor(() => expect(emitted().length).toBeGreaterThan(0));
    const before = emitted().length;
    const page = { emit: vi.fn(), rooms: new Set([TOKEN_PAGES]) };

    coordinator.sendSnapshot(page as unknown as Socket);

    const sent = page.emit.mock.calls.filter(([name]) => name === "event");
    expect(sent.map(([, event]) => event.type)).toEqual(["mock:server:connect"]);
    expect(emitted()).toHaveLength(before);
    await coordinator.stop();
  });
});

describe("the workers Studio starts", () => {
  it("are told where Studio keeps the transforms of the project's modules", async () => {
    const { coordinator } = studio();

    expect(fake.options?.transformCacheDirectory()).toBe(STUDIO_TRANSFORMS);
    await coordinator.stop();
  });
});

describe("what an edit of the mocks file is told", () => {
  it("lists each tracked mock with whether it runs and its port", async () => {
    const { coordinator, declare } = studio();
    declare({
      a: defineMockServer({ source: api, autoStart: true, port: 7555 }),
      b: defineMockServer({ source: api }),
    });

    await vi.waitFor(() =>
      expect(coordinator.summarizeServers()).toEqual([
        { key: "a", alive: true, port: 7555, portDeclared: true },
        { key: "b", alive: false, port: 7001, portDeclared: false },
      ]),
    );
    await coordinator.stop();
  });
});

describe("a command", () => {
  it("for one mock does nothing without the mock it names", async () => {
    const { coordinator, declare } = studio();
    declare({ a: defineMockServer({ source: api }) });
    await settle();

    coordinator.handleCommand("mock:managed:start", {});
    await settle();

    expect(fake.spawned).toHaveLength(0);
    await coordinator.stop();
  });

  it("for all mocks starts every one", async () => {
    const { coordinator, declare } = studio();
    declare({ a: defineMockServer({ source: api }), b: defineMockServer({ source: api }) });
    await settle();

    coordinator.handleCommand("mock:managed:startAll", {});

    await vi.waitFor(() => expect(fake.spawned.map((s) => s.serverId).sort()).toEqual(["a", "b"]));
    await coordinator.stop();
  });
});
