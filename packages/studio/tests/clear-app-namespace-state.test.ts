/**
 * Tests for `clearAppNamespaceState` — the symmetric counterpart to
 * `clearBuffer()` (session-buffer) and `CatalogStore.clear()` (catalog-store)
 * for the three globalThis-pinned Maps in app-namespace-state.
 *
 * Per-socket cleanup happens via `removeRuntimeLayer` and per-key deletes in
 * `app-namespace-handlers.ts`. This function is the per-shutdown drain that
 * `createStudioServer.close()` calls so a fresh server spun up in the same
 * process starts from clean state.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearAppNamespaceState,
  mockServers,
  nextSessionVersion,
  sessionVersionRegistry,
  socketMockServers,
} from "../src/server/app-namespace-state";

describe("clearAppNamespaceState", () => {
  beforeEach(() => {
    clearAppNamespaceState();
  });

  afterEach(() => {
    clearAppNamespaceState();
  });

  it("removes every entry from mockServers", () => {
    mockServers.set("srv-1", { name: "one" });
    mockServers.set("srv-2", { name: "two" });
    mockServers.set("srv-3", { name: "three" });

    clearAppNamespaceState();

    expect(mockServers.size).toBe(0);
  });

  it("removes every entry from socketMockServers", () => {
    socketMockServers.set("sock-a", new Set(["srv-1", "srv-2"]));
    socketMockServers.set("sock-b", new Set(["srv-3"]));

    clearAppNamespaceState();

    expect(socketMockServers.size).toBe(0);
  });

  it("removes every entry from sessionVersionRegistry", () => {
    nextSessionVersion("session-x"); // bumps to 1
    nextSessionVersion("session-y"); // bumps to 1
    nextSessionVersion("session-x"); // bumps to 2

    expect(sessionVersionRegistry.size).toBe(2);

    clearAppNamespaceState();

    expect(sessionVersionRegistry.size).toBe(0);
  });

  it("clears all three maps in a single call", () => {
    mockServers.set("srv-1", {});
    socketMockServers.set("sock-a", new Set(["srv-1"]));
    nextSessionVersion("session-x");

    clearAppNamespaceState();

    expect(mockServers.size).toBe(0);
    expect(socketMockServers.size).toBe(0);
    expect(sessionVersionRegistry.size).toBe(0);
  });

  it("is safe to call repeatedly on already-empty maps", () => {
    expect(() => {
      clearAppNamespaceState();
      clearAppNamespaceState();
      clearAppNamespaceState();
    }).not.toThrow();

    expect(mockServers.size).toBe(0);
    expect(socketMockServers.size).toBe(0);
    expect(sessionVersionRegistry.size).toBe(0);
  });

  it("nextSessionVersion resumes from 1 after clear (registry was wiped)", () => {
    nextSessionVersion("session-x"); // 1
    nextSessionVersion("session-x"); // 2
    nextSessionVersion("session-x"); // 3

    clearAppNamespaceState();

    expect(nextSessionVersion("session-x")).toBe(1);
  });
});
