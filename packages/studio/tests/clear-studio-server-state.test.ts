/**
 * `clearStudioServerState` drains the globalThis-pinned state the `/runtime`
 * namespace owns, so a Studio started again in the same process — as
 * `createStudioServer().close()` leaves it — starts from nothing. A runtime
 * that leaves is released by the namespace's disconnect handler instead.
 */

import type { Socket } from "socket.io";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearStudioServerState,
  registerRuntime,
  runtimeRegistry,
  runtimesActiveSince,
} from "../src/server/runtime-namespace-state";

function attach(runtimeId: string): void {
  const socket = { id: runtimeId, connected: true } as unknown as Socket;
  registerRuntime({ runtimeId, kind: "server", socket, transports: [], sourceNames: [] });
}

describe("clearStudioServerState", () => {
  beforeEach(() => {
    clearStudioServerState();
  });

  afterEach(() => {
    clearStudioServerState();
  });

  it("forgets every runtime, and when they began to be", () => {
    attach("rt-1");
    attach("rt-2");

    clearStudioServerState();

    expect(runtimeRegistry.size).toBe(0);
    expect(runtimesActiveSince()).toBeUndefined();
  });

  it("is safe to call on state already empty", () => {
    expect(() => {
      clearStudioServerState();
      clearStudioServerState();
    }).not.toThrow();

    expect(runtimeRegistry.size).toBe(0);
  });
});
