/**
 * A mock lifecycle command that fails — a worker that cannot be killed — is
 * logged, never left as an unhandled rejection in Studio's process.
 *
 * `lifecycle-server-ops` is mocked so every operation rejects; the commands
 * are sent through `handleCommand`, and the process's unhandledRejection
 * listener is what the test watches.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLifecycleCoordinator } from "../src/server/mock-manager/lifecycle-coordinator";
import type { CoordinatorConfig } from "../src/server/mock-manager/types";

const stopServer = vi.fn(async () => {
  throw new Error("kill failed");
});
const restartServer = vi.fn(async () => {
  throw new Error("restart failed");
});
const startServer = vi.fn(async () => {
  throw new Error("start failed");
});

vi.mock("../src/server/mock-manager/lifecycle-server-ops", () => ({
  createServerOps: () => ({
    startServer,
    stopServer,
    restartServer,
    removeServer: vi.fn(async () => {}),
    settled: vi.fn(async () => {}),
  }),
}));

vi.mock("../src/server/mock-manager/mock-registration", () => ({
  createMockRegistration: () => ({
    registerDeclared: vi.fn(),
    updateDeclared: vi.fn(),
    registerProblem: vi.fn(),
  }),
}));

vi.mock("../src/server/mock-manager/process-manager", () => ({
  createProcessManager: () => ({
    spawn: vi.fn(),
    kill: vi.fn(),
    dispose: vi.fn(async () => {}),
    has: vi.fn(() => false),
    sendCommand: vi.fn(),
  }),
}));

vi.mock("../src/server/mock-manager/lifecycle-process-events", () => ({
  createProcessEvents: () => ({}),
}));

vi.mock("../src/server/mock-manager/ui-emitter", () => ({
  createUiEmitter: () => ({
    emit: vi.fn(),
    emitServerState: vi.fn(),
  }),
}));

const mockRegistry = {
  syncFromMocks: vi.fn(),
  getEntries: vi.fn(() => []),
  attach: vi.fn(() => () => {}),
};

const config = {
  mockRegistry,
  basePort: () => 7001,
  uiNamespace: { sockets: new Map(), emit: vi.fn() } as never,
} as unknown as CoordinatorConfig;

describe("lifecycle-coordinator runVoid wrappers", () => {
  let unhandled: Array<unknown>;
  let listener: (reason: unknown) => void;

  beforeEach(() => {
    unhandled = [];
    listener = (reason) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", listener);
    stopServer.mockClear();
    restartServer.mockClear();
  });

  afterEach(() => {
    process.off("unhandledRejection", listener);
  });

  it("absorbs stopServer rejection from mock:managed:stop without unhandled rejection", async () => {
    const coordinator = createLifecycleCoordinator(config);

    coordinator.handleCommand("mock:managed:stop", { serverId: "srv-1" });

    // Allow the rejected promise to settle on the next microtask tick.
    await new Promise((r) => setTimeout(r, 5));

    expect(stopServer).toHaveBeenCalledWith("srv-1");
    expect(unhandled).toHaveLength(0);
  });

  it("absorbs restartServer rejection from mock:managed:restart without unhandled rejection", async () => {
    const coordinator = createLifecycleCoordinator(config);

    coordinator.handleCommand("mock:managed:restart", { serverId: "srv-2" });
    await new Promise((r) => setTimeout(r, 5));

    expect(restartServer).toHaveBeenCalledWith("srv-2");
    expect(unhandled).toHaveLength(0);
  });

  it("absorbs startServer rejection from mock:managed:start without unhandled rejection", async () => {
    const coordinator = createLifecycleCoordinator(config);

    coordinator.handleCommand("mock:managed:start", { serverId: "srv-3" });
    await new Promise((r) => setTimeout(r, 5));

    expect(startServer).toHaveBeenCalledWith("srv-3");
    expect(unhandled).toHaveLength(0);
  });
});
