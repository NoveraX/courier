/**
 * Tests for `CatalogStore.clear()` — the shutdown / test-isolation reset
 * that drops every runtime layer and resets the merged catalog without
 * touching scan layer state or removing external listeners.
 *
 * `clear()` is called from `createStudioServer.close()` so a fresh server
 * spun up in the same process (e.g. between integration tests) starts from
 * a clean catalog state. It MUST NOT be called from per-socket disconnect
 * handlers — those use `removeRuntimeLayer(sessionId)` instead.
 */

import { describe, expect, it, vi } from "vitest";

import type { SourceMap } from "@noverax/nexus-studio-core";
import { CatalogStore } from "../src/server/catalog";

function makeLayer(prefix: string): SourceMap {
  return {
    api: {
      baseURL: `http://${prefix}.example.com`,
      groups: {
        users: {
          prefix: `/${prefix}/users`,
          endpoints: {
            getAll: {
              type: "query",
              hasVariablesSchema: false,
              hasResponseSchema: false,
            },
          },
        },
      },
    },
  } as unknown as SourceMap;
}

describe("CatalogStore.clear", () => {
  it("removes every runtime layer", () => {
    const store = new CatalogStore();
    store.setRuntimeLayer("session-a", makeLayer("a"));
    store.setRuntimeLayer("session-b", makeLayer("b"));
    store.setRuntimeLayer("session-c", makeLayer("c"));

    store.clear();

    expect(store.getRuntimeLayer("session-a")).toBeUndefined();
    expect(store.getRuntimeLayer("session-b")).toBeUndefined();
    expect(store.getRuntimeLayer("session-c")).toBeUndefined();
  });

  it("resets the merged catalog snapshot to an empty object", () => {
    const store = new CatalogStore();
    store.setRuntimeLayer("session-a", makeLayer("a"));
    store.flush();
    expect(Object.keys(store.getSnapshot().catalog).length).toBeGreaterThan(0);

    store.clear();

    expect(store.getSnapshot().catalog).toEqual({});
    expect(store.getSnapshot().meta.runtimeSessions).toEqual([]);
    expect(store.getSnapshot().meta.totalEndpoints).toBe(0);
  });

  it("preserves snapshotListeners and namesListeners", () => {
    const store = new CatalogStore();
    const snapshotListener = vi.fn();
    const namesListener = vi.fn();
    store.onChange(snapshotListener);
    store.onNamesChange(namesListener);

    store.clear();

    // Listeners are still subscribed — a subsequent setRuntimeLayer + flush
    // should reach them.
    snapshotListener.mockClear();
    namesListener.mockClear();
    store.setRuntimeLayer("session-after", makeLayer("after"));
    store.flush();

    expect(snapshotListener).toHaveBeenCalledTimes(1);
  });

  it("preserves the scan layer", () => {
    const store = new CatalogStore();
    const scanLayer = makeLayer("scan");
    store.setScanLayer(scanLayer);
    store.setRuntimeLayer("session-a", makeLayer("a"));
    store.flush();

    store.clear();

    // Scan layer is owned by the file watcher, so clear() leaves it intact.
    // The merged catalog should reflect the scan layer alone after clear.
    const snapshot = store.getSnapshot();
    expect(snapshot.meta.scanTimestamp).not.toBeNull();
    expect(Object.keys(snapshot.catalog).length).toBeGreaterThan(0);
  });

  it("cancels any pending debounced emit", () => {
    vi.useFakeTimers();
    try {
      const store = new CatalogStore();
      const listener = vi.fn();
      store.onChange(listener);

      // Trigger a debounced emit, then clear before the timer fires.
      store.setRuntimeLayer("session-a", makeLayer("a"));
      listener.mockClear();

      store.clear();

      // The synchronous emit from clear() itself.
      expect(listener).toHaveBeenCalledTimes(1);
      listener.mockClear();

      // Advance past the debounce window — no additional emit should arrive.
      vi.advanceTimersByTime(200);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits a final snapshot synchronously so subscribers see the cleared state", () => {
    const store = new CatalogStore();
    const listener = vi.fn();
    store.setRuntimeLayer("session-a", makeLayer("a"));
    store.flush();
    store.onChange(listener);

    store.clear();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        catalog: {},
        meta: expect.objectContaining({ runtimeSessions: [], totalEndpoints: 0 }),
      }),
    );
  });

  it("is safe to call repeatedly on an already-empty store", () => {
    const store = new CatalogStore();

    expect(() => {
      store.clear();
      store.clear();
      store.clear();
    }).not.toThrow();

    expect(store.getSnapshot().catalog).toEqual({});
  });
});
