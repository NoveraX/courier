/**
 * Tests for the process-global Studio Playground abort registry.
 *
 * The registry exists to side-step a Node loopback fetch quirk: when the
 * Studio Playground proxy executor and the SSE/WS handler live in the
 * same process, the executor's `controller.abort()` does NOT synchronously
 * propagate to the server-side `request.signal`. Without this registry,
 * "Unsubscribe" silently fails — events keep flowing because the handler
 * never observes the cancel.
 *
 * Coverage:
 *  - Round-trip register/abort/unregister
 *  - Empty rid is a no-op (defensive — production calls always pass UUIDs)
 *  - Cross-process scenario simulation: missing rid → no-op, returns false
 *  - Unregister only removes its own entry (defensive against rid reuse)
 *  - Multiple concurrent rids isolated correctly
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  abortPlayground,
  clearPlaygroundAbortRegistry,
  playgroundAbortRegistrySize,
  registerPlaygroundAbort,
} from "../src/studio";

beforeEach(() => {
  clearPlaygroundAbortRegistry();
});

afterEach(() => {
  clearPlaygroundAbortRegistry();
});

describe("registerPlaygroundAbort + abortPlayground", () => {
  it("registers and invokes an abort callback", () => {
    const abort = vi.fn();
    registerPlaygroundAbort("rid-1", abort);

    expect(playgroundAbortRegistrySize()).toBe(1);
    expect(abortPlayground("rid-1")).toBe(true);
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("returns false when no entry is registered (cross-process scenario)", () => {
    expect(abortPlayground("nonexistent")).toBe(false);
  });

  it("returns false for empty requestId (defensive guard)", () => {
    expect(abortPlayground("")).toBe(false);
  });

  it("registering with empty rid is a no-op", () => {
    const abort = vi.fn();
    registerPlaygroundAbort("", abort);
    expect(playgroundAbortRegistrySize()).toBe(0);
  });

  it("unregister removes the entry from the registry", () => {
    const abort = vi.fn();
    const unregister = registerPlaygroundAbort("rid-2", abort);
    expect(playgroundAbortRegistrySize()).toBe(1);

    unregister();
    expect(playgroundAbortRegistrySize()).toBe(0);
    expect(abortPlayground("rid-2")).toBe(false);
    expect(abort).not.toHaveBeenCalled();
  });

  it("isolates concurrent rids — aborting one does not affect others", () => {
    const abortA = vi.fn();
    const abortB = vi.fn();
    registerPlaygroundAbort("rid-a", abortA);
    registerPlaygroundAbort("rid-b", abortB);

    expect(playgroundAbortRegistrySize()).toBe(2);
    abortPlayground("rid-a");

    expect(abortA).toHaveBeenCalledTimes(1);
    expect(abortB).not.toHaveBeenCalled();
    expect(playgroundAbortRegistrySize()).toBe(2); // abort doesn't auto-unregister
  });

  it("unregister only removes its own entry — does not clear a fresh handler with the same rid", () => {
    const oldAbort = vi.fn();
    const oldUnregister = registerPlaygroundAbort("rid-shared", oldAbort);

    // Simulate a fresh handler taking over the same rid (defensive — UUIDs
    // make this nearly impossible in production but the guard is cheap).
    const freshAbort = vi.fn();
    registerPlaygroundAbort("rid-shared", freshAbort);

    // Old unregister should NOT clear the fresh entry.
    oldUnregister();
    expect(playgroundAbortRegistrySize()).toBe(1);
    expect(abortPlayground("rid-shared")).toBe(true);
    expect(freshAbort).toHaveBeenCalledTimes(1);
    expect(oldAbort).not.toHaveBeenCalled();
  });

  it("calling abortPlayground multiple times on the same rid is safe (idempotent until unregistered)", () => {
    const abort = vi.fn();
    registerPlaygroundAbort("rid-3", abort);

    abortPlayground("rid-3");
    abortPlayground("rid-3");
    abortPlayground("rid-3");

    // Each call invokes the callback — it's the callback's job to be idempotent.
    expect(abort).toHaveBeenCalledTimes(3);
  });
});

describe("clearPlaygroundAbortRegistry", () => {
  it("removes all entries", () => {
    registerPlaygroundAbort("a", vi.fn());
    registerPlaygroundAbort("b", vi.fn());
    registerPlaygroundAbort("c", vi.fn());
    expect(playgroundAbortRegistrySize()).toBe(3);

    clearPlaygroundAbortRegistry();
    expect(playgroundAbortRegistrySize()).toBe(0);
  });
});
