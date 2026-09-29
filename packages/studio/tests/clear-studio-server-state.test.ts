/**
 * Tests for `clearStudioServerState` — the symmetric counterpart to
 * `CatalogStore.clear()` (catalog-store) for the globalThis-pinned Maps
 * owned by the `/runtime` namespace.
 *
 * Per-runtime cleanup happens via the `/runtime` disconnect handler. This
 * function is the per-shutdown drain that `createStudioServer.close()` calls so a fresh
 * server spun up in the same process starts from clean state.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearStudioServerState,
  nextSessionVersion,
  runtimeRegistry,
  sessionVersionRegistry,
} from "../src/server/runtime-namespace-state";

describe("clearStudioServerState", () => {
  beforeEach(() => {
    clearStudioServerState();
  });

  afterEach(() => {
    clearStudioServerState();
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

  it("clears every map in a single call", () => {
    nextSessionVersion("session-x");
    const fakeSocket = { id: "s-1" } as any;
    runtimeRegistry.set("rt-1", {
      runtimeId: "rt-1",
      kind: "server",
      socket: fakeSocket,
      transports: [],
      sourceNames: [],
    });

    clearStudioServerState();

    expect(sessionVersionRegistry.size).toBe(0);
    expect(runtimeRegistry.size).toBe(0);
  });

  it("is safe to call repeatedly on already-empty maps", () => {
    expect(() => {
      clearStudioServerState();
      clearStudioServerState();
      clearStudioServerState();
    }).not.toThrow();

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
