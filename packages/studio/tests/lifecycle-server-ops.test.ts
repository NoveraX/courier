/**
 * A mock whose worker cannot be started says why on the mock, which every
 * page is told — a page without the project's token too — so the reason
 * names no path of the machine Studio runs on.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createServerOps } from "../src/server/mock-manager/lifecycle-server-ops";
import type { ProcessManager, ServerState } from "../src/server/mock-manager/types";

const PROJECT = join(homedir(), "work", "shop");

function mock(): ServerState {
  return {
    serverId: "apiMock",
    name: "apiMock",
    mocksFile: join(PROJECT, "courier.mocks.ts"),
    mockKey: "apiMock",
    relativePath: "courier.mocks.ts:apiMock",
    configuredPort: 7001,
    portDeclared: true,
    autoStart: false,
    status: "declared",
    origin: "studio",
    routes: [],
    collections: [],
    storeSeq: 0,
    scenarios: [],
    activeScenario: null,
  };
}

function workers(spawn: ProcessManager["spawn"]): ProcessManager {
  return {
    spawn,
    kill: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
    has: () => false,
    sendCommand: vi.fn(async () => ({ ok: false, error: "gone" })),
  };
}

function failingToStart(state: ServerState, error: Error) {
  return createServerOps({
    servers: new Map([["apiMock", state]]),
    projectRoot: PROJECT,
    processManager: workers(() => {
      throw error;
    }),
    updateAndEmit: (_serverId, patch) => Object.assign(state, patch),
    reservedPorts: () => [],
    isClosed: () => false,
  });
}

describe("a mock whose worker cannot be started", () => {
  it("says why with no path of this machine in it", async () => {
    const state = mock();
    const node = join(homedir(), ".nvm", "versions", "node", "v24", "bin", "node");
    const ops = failingToStart(
      state,
      new Error(`spawn ${node} ENOENT in ${join(PROJECT, "mocks")}`),
    );

    await ops.startServer("apiMock");

    expect(state).toMatchObject({
      status: "crashed",
      lastError: "spawn ~/.nvm/versions/node/v24/bin/node ENOENT in mocks",
    });
  });

  it("names a path in the project from its root, wherever in it the mocks file is", async () => {
    const state = { ...mock(), mocksFile: join(PROJECT, "mocks", "courier.mocks.ts") };
    const ops = failingToStart(
      state,
      new Error(`EACCES: open '${join(PROJECT, "src", "db.json")}'`),
    );

    await ops.startServer("apiMock");

    expect(state).toMatchObject({ status: "crashed", lastError: "EACCES: open 'src/db.json'" });
  });
});
