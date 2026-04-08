/**
 * HMR survival coverage for session-buffer's `requestEvents` and
 * `activeSessions` collections. Mirrors `playground-registry-hmr.test.ts`
 * in studio-core: two independent module loads (simulated via
 * `vi.resetModules`) must observe the same backing storage so that
 * Next.js HMR / Turbopack module duplication does not orphan buffered
 * events from the previous module instance.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REQUEST_EVENTS_KEY = Symbol.for("nexus.studio.session-request-events");
const ACTIVE_SESSIONS_KEY = Symbol.for("nexus.studio.session-active-sessions");

const g = globalThis as Record<symbol, unknown>;

beforeEach(() => {
  delete g[REQUEST_EVENTS_KEY];
  delete g[ACTIVE_SESSIONS_KEY];
  vi.resetModules();
});

afterEach(() => {
  delete g[REQUEST_EVENTS_KEY];
  delete g[ACTIVE_SESSIONS_KEY];
});

describe("session-buffer — HMR survival", () => {
  it("requestEvents Map is shared across module reloads", async () => {
    const first = await import("../src/server/session-buffer");
    first.bufferEvent({
      type: "request:start",
      id: "req-1",
      source: "api",
      group: "users",
      method: "getAll",
      sessionId: "sess-1",
      timestamp: 1,
    });
    expect(first.hasBufferedData()).toBe(true);
    expect(first.getBufferedRequests()).toHaveLength(1);

    vi.resetModules();
    const second = await import("../src/server/session-buffer");

    expect(second.hasBufferedData()).toBe(true);
    expect(second.getBufferedRequests()).toHaveLength(1);
    expect(second.getBufferedRequests()[0]?.["id"]).toBe("req-1");
  });

  it("activeSessions Set is shared across module reloads", async () => {
    const first = await import("../src/server/session-buffer");
    first.bufferEvent({
      type: "request:start",
      id: "req-1",
      sessionId: "sess-A",
      timestamp: 1,
    });
    first.bufferEvent({
      type: "request:start",
      id: "req-2",
      sessionId: "sess-B",
      timestamp: 2,
    });
    expect(first.getActiveSessionIds().sort()).toEqual(["sess-A", "sess-B"]);

    vi.resetModules();
    const second = await import("../src/server/session-buffer");

    expect(second.getActiveSessionIds().sort()).toEqual(["sess-A", "sess-B"]);
  });

  it("clearBuffer clears the same shared storage observed by a fresh module", async () => {
    const first = await import("../src/server/session-buffer");
    first.bufferEvent({
      type: "request:start",
      id: "req-1",
      sessionId: "sess-1",
      timestamp: 1,
    });
    expect(first.hasBufferedData()).toBe(true);

    vi.resetModules();
    const second = await import("../src/server/session-buffer");
    expect(second.hasBufferedData()).toBe(true);

    second.clearBuffer();
    expect(second.hasBufferedData()).toBe(false);
    expect(second.getActiveSessionIds()).toEqual([]);

    // First module instance also observes the cleared state because both
    // share the same backing Map/Set on globalThis.
    expect(first.hasBufferedData()).toBe(false);
    expect(first.getActiveSessionIds()).toEqual([]);
  });
});
