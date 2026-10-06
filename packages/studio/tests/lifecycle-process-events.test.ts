/**
 * What Studio does when a managed mock fails: it says why in the terminal and
 * keeps the reason on the mock for the UI — the worker's own reason, not the
 * exit that followed it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProcessEvents } from "../src/server/mock-manager/lifecycle-process-events";
import type { ServerState } from "../src/server/mock-manager/types";

let output: string[];

beforeEach(() => {
  output = [];
  for (const level of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function events() {
  const state = {
    serverId: "apiMock",
    name: "apiMock",
    status: "starting",
    routes: [],
    collections: [],
    scenarios: [],
  } as unknown as ServerState;
  const servers = new Map([["apiMock", state]]);
  const updateAndEmit = (serverId: string, patch: Partial<ServerState>) => {
    Object.assign(servers.get(serverId) as ServerState, patch);
  };
  return {
    state,
    handlers: createProcessEvents({ servers, emit: vi.fn(), updateAndEmit, resendStore: vi.fn() }),
  };
}

describe("a managed mock that fails", () => {
  it("says why in the terminal and keeps the reason on the mock", () => {
    const { state, handlers } = events();

    handlers.onError("apiMock", "Cannot find package '@hono/node-server'", true);

    expect(output.join("")).toContain("Cannot find package '@hono/node-server'");
    expect(state).toMatchObject({
      status: "crashed",
      lastError: "Cannot find package '@hono/node-server'",
    });
  });

  it("keeps the reason's first line for the UI, and its stack for the terminal", () => {
    const { state, handlers } = events();
    const stack =
      "Error: listen EADDRINUSE: address already in use 127.0.0.1:7471\n    at addressInUse (file:///app/node_modules/@noverax/courier-mock/lib/create-mock-server.js:833:23)";

    handlers.onError("apiMock", stack, true);

    expect(state.lastError).toBe("Error: listen EADDRINUSE: address already in use 127.0.0.1:7471");
    expect(output.join("")).toContain("at addressInUse");
  });

  it("keeps the reason the worker gave when it then exits", () => {
    const { state, handlers } = events();

    handlers.onError("apiMock", "port 7401 is in use", true);
    handlers.onExited("apiMock", "exited with code 1");

    expect(state.lastError).toBe("port 7401 is in use");
  });

  it("is reported by how it ended when the worker gave no reason", () => {
    const { state, handlers } = events();

    handlers.onExited("apiMock", "was stopped by SIGKILL");

    expect(output.join("")).toContain("was stopped by SIGKILL");
    expect(state).toMatchObject({ status: "crashed", lastError: "was stopped by SIGKILL" });
  });

  it("leaves no stale reason once it runs again", () => {
    const { state, handlers } = events();
    handlers.onError("apiMock", "port 7401 is in use", true);

    handlers.onReady("apiMock", {
      port: 7401,
      url: "http://localhost:7401",
      routes: [],
      collections: [],
      scenarios: [],
      network: { latency: 0, errorRate: 0, latencyPreset: "none", chaosPreset: "none" },
    });

    expect(state).toMatchObject({ status: "running", lastError: undefined });
  });
});

describe("a managed mock that starts again", () => {
  it("serves the network conditions it starts with, not the ones set before", () => {
    const { state, handlers } = events();
    Object.assign(state, {
      chaosPreset: "unstable",
      chaosStartedAt: 99,
      networkConfig: { latency: 0, errorRate: 0.4, chaosPreset: "unstable" },
    });
    const declared = {
      latency: 200,
      errorRate: 0,
      latencyPreset: "none",
      latencyStartedAt: null,
      chaosPreset: "none",
      chaosStartedAt: null,
    };

    handlers.onReady("apiMock", {
      port: 7401,
      url: "http://localhost:7401",
      routes: [],
      collections: [],
      scenarios: [],
      network: declared,
    });

    expect(state).toMatchObject({
      chaosPreset: "none",
      chaosStartedAt: null,
      latencyPreset: "none",
      networkConfig: declared,
    });
  });

  it("serves none when its worker reports none", () => {
    const { state, handlers } = events();
    Object.assign(state, { chaosPreset: "unstable", networkConfig: { errorRate: 0.4 } });
    const ready: Record<string, unknown> = {
      port: 7401,
      url: "http://localhost:7401",
      routes: [],
      collections: [],
      scenarios: [],
    };

    Reflect.apply(handlers.onReady, handlers, ["apiMock", ready]);

    expect(state.chaosPreset).toBeUndefined();
    expect(state.networkConfig).toBeUndefined();
  });
});

const ROUTE = {
  group: "users",
  endpoint: "list",
  httpMethod: "GET",
  path: "",
  fullPath: "/users",
  source: "auto",
  hits: 0,
  avgLatency: 0,
};

const SCENARIO = {
  name: "empty",
  endpointCount: 1,
  isActive: true,
  hasStateMachine: false,
  stateTransitions: [],
  endpoints: [{ group: "users", endpoint: "list", httpMethod: "GET", behavior: "returns" }],
};

function workerEvents() {
  const emit = vi.fn();
  const state = {
    serverId: "apiMock",
    name: "apiMock",
    status: "running",
    routes: [ROUTE],
    collections: [{ name: "users", count: 1, records: [{ id: 1 }] }],
    storeSeq: 0,
    scenarios: [],
    activeScenario: null,
  } as unknown as ServerState;
  const servers = new Map([["apiMock", state]]);
  const resendStore = vi.fn();
  const handlers = createProcessEvents({ servers, emit, updateAndEmit: vi.fn(), resendStore });
  return { state, emit, resendStore, onEvent: handlers.onEvent };
}

const ADD_ADA = {
  name: "users",
  count: 2,
  edits: { removed: [], changed: [], added: [{ id: 2, name: "Ada" }] },
};

describe("what Studio keeps of a managed mock's events", () => {
  it("applies each report of the store's changes, and not one of another shape", () => {
    const { state, resendStore, onEvent } = workerEvents();
    const report = { type: "mock:store:changes", whole: false, removed: [] };

    onEvent("apiMock", { ...report, seq: 1, collections: [ADD_ADA] });
    onEvent("apiMock", { ...report, seq: "2", collections: [] });

    expect(state.collections).toEqual([
      { name: "users", count: 2, records: [{ id: 1 }, { id: 2, name: "Ada" }] },
    ]);
    expect(state.storeSeq).toBe(1);
    expect(resendStore).not.toHaveBeenCalled();
  });

  it("asks the mock for its store whole when a report skips one", () => {
    const { state, resendStore, onEvent } = workerEvents();

    onEvent("apiMock", {
      type: "mock:store:changes",
      seq: 2,
      whole: false,
      collections: [ADD_ADA],
      removed: [],
    });

    expect(resendStore).toHaveBeenCalledWith("apiMock");
    expect(state).toMatchObject({ storeSeq: 0, collections: [{ name: "users", count: 1 }] });
  });

  it("asks the mock for its store whole when a report's edits do not fit Studio's copy", () => {
    const { state, resendStore, onEvent } = workerEvents();
    const edits = { removed: [4], changed: [], added: [] };

    onEvent("apiMock", {
      type: "mock:store:changes",
      seq: 1,
      whole: false,
      collections: [{ name: "users", count: 0, edits }],
      removed: [],
    });

    expect(resendStore).toHaveBeenCalledWith("apiMock");
    expect(state.storeSeq).toBe(0);
  });

  it("passes over a report older than the store Studio holds", () => {
    const { state, resendStore, onEvent } = workerEvents();
    state.storeSeq = 5;

    onEvent("apiMock", {
      type: "mock:store:changes",
      seq: 3,
      whole: false,
      collections: [ADD_ADA],
      removed: [],
    });

    expect(resendStore).not.toHaveBeenCalled();
    expect(state).toMatchObject({ storeSeq: 5, collections: [{ name: "users", count: 1 }] });
  });

  it("takes a whole report, whatever its number, as the store", () => {
    const { state, onEvent } = workerEvents();
    state.storeSeq = 5;
    const posts = { name: "posts", count: 1, records: [{ id: 7 }] };

    onEvent("apiMock", {
      type: "mock:store:changes",
      seq: 1,
      whole: true,
      collections: [posts],
      removed: [],
    });

    expect(state).toMatchObject({ storeSeq: 1, collections: [posts] });
  });

  it("keeps the scenario applied with its scenarios and routes, each only of its shape", () => {
    const { state, onEvent } = workerEvents();

    onEvent("apiMock", {
      type: "mock:scenario:active",
      scenario: "empty",
      scenarios: [SCENARIO],
      routes: [{ group: "users", endpoint: "list" }],
    });

    expect(state.activeScenario).toBe("empty");
    expect(state.scenarios).toEqual([SCENARIO]);
    expect(state.routes).toEqual([ROUTE]);
  });

  it("keeps the network presets, each only of its type", () => {
    const { state, onEvent } = workerEvents();

    onEvent("apiMock", {
      type: "mock:network:config",
      config: {
        latency: 0,
        errorRate: 0.5,
        latencyPreset: 7,
        chaosPreset: "flaky",
        chaosStartedAt: 99,
      },
    });

    expect(state).toMatchObject({ chaosPreset: "flaky", chaosStartedAt: 99 });
    expect(state.latencyPreset).toBeUndefined();
  });

  it("keeps no network settings once the mock halted its experiment", () => {
    const { state, onEvent } = workerEvents();
    onEvent("apiMock", {
      type: "mock:network:config",
      config: { latency: 0, errorRate: 0.5, chaosPreset: "flaky", chaosStartedAt: 99 },
    });

    onEvent("apiMock", {
      type: "mock:network:config",
      config: { autoHalted: true, haltReason: "error rate over 50%" },
    });

    expect(state.networkConfig).toBeUndefined();
    expect(state.chaosPreset).toBeUndefined();
  });

  it("sends the page no event that names no type", () => {
    const { emit, onEvent } = workerEvents();

    onEvent("apiMock", { type: 7, requestId: "r1" });

    expect(emit).not.toHaveBeenCalled();
  });
});

describe("the requests a managed mock answered", () => {
  it("are kept as the page was sent them, with the time they were shown", () => {
    const emit = vi.fn();
    const record = vi.fn();
    const servers = new Map<string, ServerState>();
    const mockLog = {
      record,
      events: () => [],
      forget: vi.fn(),
      forgetAll: vi.fn(),
      close: () => undefined,
    };
    const { onEvent } = createProcessEvents({
      servers,
      emit,
      updateAndEmit: vi.fn(),
      mockLog,
      resendStore: vi.fn(),
    });
    const start = {
      type: "mock:request:start",
      requestId: "r1",
      httpMethod: "GET",
      path: "/users",
    };
    vi.spyOn(Date, "now").mockReturnValue(1_791_100_000_000);

    onEvent("apiMock", start);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledTimes(1);
    const kept: unknown = record.mock.calls[0]?.[0];
    expect(kept).toEqual({ ...start, serverId: "apiMock", timestamp: 1_791_100_000_000 });
    expect(emit.mock.calls[0]).toEqual(["mock:request:start", kept]);
  });
});

describe("a mock whose port another process took before it listened", () => {
  function racing(portDeclared: boolean) {
    const state = {
      serverId: "apiMock",
      name: "apiMock",
      status: "starting",
      portDeclared,
      configuredPort: 7001,
      routes: [],
      collections: [],
      scenarios: [],
    } as unknown as ServerState;
    const servers = new Map([["apiMock", state]]);
    const updateAndEmit = (serverId: string, patch: Partial<ServerState>) => {
      Object.assign(servers.get(serverId) as ServerState, patch);
    };
    const restart = vi.fn();
    const handlers = createProcessEvents({
      servers,
      emit: vi.fn(),
      updateAndEmit,
      resendStore: vi.fn(),
      restart,
    });
    const lose = () => {
      handlers.onError("apiMock", "Port 7001 is in use by another process.", true, "PORT_IN_USE");
      handlers.onExited("apiMock", "exited with code 1");
    };
    return { state, handlers, restart, lose };
  }

  it("starts again, on the next free port, when Studio assigned the port", () => {
    const { state, restart, lose } = racing(false);

    lose();

    expect(restart).toHaveBeenCalledWith("apiMock");
    expect(state.status).toBe("starting");
    expect(output.join("\n")).toContain("Studio starts it on the next free port.");
  });

  it("fails with the reason when the developer named the port", () => {
    const { state, restart, lose } = racing(true);

    lose();

    expect(restart).not.toHaveBeenCalled();
    expect(state).toMatchObject({
      status: "crashed",
      lastError: "Port 7001 is in use by another process.",
    });
  });

  it("gives up after three tries, and tries afresh once it started", () => {
    const { state, handlers, restart, lose } = racing(false);

    for (let i = 0; i < 4; i++) lose();
    const gaveUp = { status: state.status, restarts: restart.mock.calls.length };
    handlers.onReady("apiMock", {
      port: 7004,
      url: "http://localhost:7004",
      routes: [],
      collections: [],
    } as never);
    lose();

    expect(gaveUp).toEqual({ status: "crashed", restarts: 3 });
    expect(restart).toHaveBeenCalledTimes(4);
  });
});
