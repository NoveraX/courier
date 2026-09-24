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
  for (const stream of [process.stdout, process.stderr]) {
    vi.spyOn(stream, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
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
  return { state, handlers: createProcessEvents({ servers, emit: vi.fn(), updateAndEmit }) };
}

describe("a managed mock that fails", () => {
  it("says why in the terminal and keeps the reason on the mock", () => {
    const { state, handlers } = events();

    handlers.onError("apiMock", "Cannot find package '@hono/node-server'", true);

    expect(output.join("")).toContain("Cannot find package '@hono/node-server'");
    expect(state).toMatchObject({ status: "crashed", lastError: "Cannot find package '@hono/node-server'" });
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

    handlers.onReady("apiMock", { port: 7401, url: "http://localhost:7401", routes: [], collections: [], scenarios: [] });

    expect(state).toMatchObject({ status: "running", lastError: undefined });
  });
});
