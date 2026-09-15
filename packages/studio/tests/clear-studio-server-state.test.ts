/**
 * Tests for `clearStudioServerState` — the symmetric counterpart to
 * `clearBuffer()` (session-buffer) and `CatalogStore.clear()` (catalog-store)
 * for the four globalThis-pinned Maps owned by the `/runtime` namespace.
 *
 * Per-runtime cleanup happens via the `/runtime` disconnect handler;
 * per-socket mock cleanup lives in per-key delete sites. This function is
 * the per-shutdown drain that `createStudioServer.close()` calls so a fresh
 * server spun up in the same process starts from clean state.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearStudioServerState,
  mockServers,
  nextSessionVersion,
  runtimeRegistry,
  sessionVersionRegistry,
  socketMockServers,
} from "../src/server/runtime-namespace-state";

describe("clearStudioServerState", () => {
  beforeEach(() => {
    clearStudioServerState();
  });

  afterEach(() => {
    clearStudioServerState();
  });

  it("removes every entry from mockServers", () => {
    mockServers.set("srv-1", { name: "one" });
    mockServers.set("srv-2", { name: "two" });
    mockServers.set("srv-3", { name: "three" });

    clearStudioServerState();

    expect(mockServers.size).toBe(0);
  });

  it("removes every entry from socketMockServers", () => {
    socketMockServers.set("sock-a", new Set(["srv-1", "srv-2"]));
    socketMockServers.set("sock-b", new Set(["srv-3"]));

    clearStudioServerState();

    expect(socketMockServers.size).toBe(0);
  });

  it("removes every entry from sessionVersionRegistry", () => {
    nextSessionVersion("session-x");
    nextSessionVersion("session-y");
    nextSessionVersion("session-x");

    expect(sessionVersionRegistry.size).toBe(2);

    clearStudioServerState();

    expect(sessionVersionRegistry.size).toBe(0);
  });

  it("removes every entry from runtimeRegistry", () => {
    // biome-ignore lint/suspicious/noExplicitAny: minimal stub for the Socket shape
    const fakeSocket = { id: "s-1" } as any;
    runtimeRegistry.set("rt-1", {
      runtimeId: "rt-1",
      kind: "server",
      socket: fakeSocket,
      transports: [],
      sourceNames: [],
    });

    clearStudioServerState();

    expect(runtimeRegistry.size).toBe(0);
  });

  it("clears all four maps in a single call", () => {
    mockServers.set("srv-1", {});
    socketMockServers.set("sock-a", new Set(["srv-1"]));
    nextSessionVersion("session-x");
    // biome-ignore lint/suspicious/noExplicitAny: minimal stub for the Socket shape
    const fakeSocket = { id: "s-1" } as any;
    runtimeRegistry.set("rt-1", {
      runtimeId: "rt-1",
      kind: "server",
      socket: fakeSocket,
      transports: [],
      sourceNames: [],
    });

    clearStudioServerState();

    expect(mockServers.size).toBe(0);
    expect(socketMockServers.size).toBe(0);
    expect(sessionVersionRegistry.size).toBe(0);
    expect(runtimeRegistry.size).toBe(0);
  });

  it("is safe to call repeatedly on already-empty maps", () => {
    expect(() => {
      clearStudioServerState();
      clearStudioServerState();
      clearStudioServerState();
    }).not.toThrow();

    expect(mockServers.size).toBe(0);
    expect(socketMockServers.size).toBe(0);
    expect(sessionVersionRegistry.size).toBe(0);
    expect(runtimeRegistry.size).toBe(0);
  });

  it("nextSessionVersion resumes from 1 after clear (registry was wiped)", () => {
    nextSessionVersion("session-x");
    nextSessionVersion("session-x");
    nextSessionVersion("session-x");

    clearStudioServerState();

    expect(nextSessionVersion("session-x")).toBe(1);
  });
});
