/**
 * Regression test: a runtime leaving the binding table must NOT wipe the
 * requests it produced.
 *
 * Scenario:
 * 1. Browser opens direct SSE/WS — emits stream:open with sessionId=A
 * 2. User triggers a proxy SSE/WS — server emits stream:open with sessionId=B
 * 3. Browser tab Fast Refresh / hard reload → runtime A drops out of the
 *    binding snapshot
 *
 * The Studio dev server can have several cooperating runtimes (browser
 * direct + server proxy) and HMR/Turbopack rebuilds blip them constantly;
 * losing one side's request history on a lifecycle blip would be surprising
 * and asymmetric. The store must keep the request log intact across binding
 * transitions; only an explicit `clearRequests()` should wipe it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createActions } from "../ui/src/store/actions";
import { DEFAULT_SETTINGS } from "../ui/src/store/constants";
import { createInitialState } from "../ui/src/store/initial-state";
import type { StudioState } from "../ui/src/store/store-types";
import type { BindingSnapshot } from "../ui/src/store/types-ui";

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: () => null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
  (globalThis as { document?: Document }).document = {
    documentElement: { classList: { add: vi.fn(), remove: vi.fn() }, dataset: {} },
  } as unknown as Document;
});

function freshStore() {
  let state: StudioState = {
    ...createInitialState("dark"),
    settings: { ...DEFAULT_SETTINGS },
  } as StudioState;

  const get = () => state;
  const set = (updater: Partial<StudioState> | ((s: StudioState) => Partial<StudioState>)) => {
    const patch = typeof updater === "function" ? updater(state) : updater;
    state = { ...state, ...patch };
  };

  const actions = createActions(set as never, get as never);
  state = { ...state, ...actions } as StudioState;
  return get;
}

/* Studio keeps when the attached runtimes arrived; these all came at one time. */
const ACTIVE_SINCE = 1_791_100_000_000;

function snapshot(runtimes: string[], sources: string[]): BindingSnapshot {
  return {
    ...(runtimes.length > 0 && { activeSince: ACTIVE_SINCE }),
    rows: runtimes.flatMap((runtimeId) =>
      sources.map((sourceName) => ({
        sourceName,
        transport: "http" as const,
        status: "bound" as const,
        runtimeId,
      })),
    ),
    runtimeCount: runtimes.length,
    sourceCount: sources.length,
    runtimes: runtimes.map((runtimeId) => ({ runtimeId, kind: "server" as const })),
  };
}

function emitStreamOpen(
  get: () => StudioState,
  args: { requestId: string; sessionId: string; mode: "direct" | "proxy" },
) {
  get().handleEvents([
    {
      type: "stream:open",
      timestamp: Date.now(),
      sessionId: args.sessionId,
      requestId: args.requestId,
      id: args.requestId,
      source: "api",
      group: "notifications",
      method: "feed",
      transport: "sse",
      mode: args.mode,
    } as never,
  ]);
}

describe("binding snapshot transitions — request retention", () => {
  it("keeps direct requests when one runtime drops out", () => {
    const get = freshStore();

    get().setBindingSnapshot(snapshot(["rt_browser", "rt_server"], ["api"]));
    emitStreamOpen(get, {
      requestId: "req_direct_1",
      sessionId: "rt_browser",
      mode: "direct",
    });
    emitStreamOpen(get, {
      requestId: "req_proxy_1",
      sessionId: "rt_server",
      mode: "proxy",
    });

    expect(get().requests).toHaveLength(2);

    // Browser runtime blip — Fast Refresh / Turbopack rebuild / hard reload
    get().setBindingSnapshot(snapshot(["rt_server"], ["api"]));

    // Direct entry survives the blip
    expect(get().requests).toHaveLength(2);
    expect(
      get()
        .requests.map((r) => r.mode)
        .sort(),
    ).toEqual(["direct", "proxy"]);

    // Binding snapshot does drop the disconnected runtime
    expect(get().bindingSnapshot.runtimeCount).toBe(1);
  });

  it("keeps requests even when ALL runtimes drop out", () => {
    const get = freshStore();

    get().setBindingSnapshot(snapshot(["rt_browser"], ["api"]));
    emitStreamOpen(get, {
      requestId: "req_direct_1",
      sessionId: "rt_browser",
      mode: "direct",
    });

    get().setBindingSnapshot(snapshot([], []));

    // No active runtimes, but the request log is intact
    expect(get().bindingSnapshot.runtimeCount).toBe(0);
    expect(get().requests).toHaveLength(1);
  });

  it("clearRequests still wipes everything (explicit user action)", () => {
    const get = freshStore();

    get().setBindingSnapshot(snapshot(["rt_a"], ["api"]));
    emitStreamOpen(get, { requestId: "r1", sessionId: "rt_a", mode: "direct" });
    emitStreamOpen(get, { requestId: "r2", sessionId: "rt_a", mode: "proxy" });

    expect(get().requests).toHaveLength(2);

    get().clearRequests();

    expect(get().requests).toHaveLength(0);
  });

  it("clearRequests with preserveLog=true keeps pinned requests", () => {
    const get = freshStore();
    get().updateSettings({ preserveLog: true });

    get().setBindingSnapshot(snapshot(["rt_a"], ["api"]));
    emitStreamOpen(get, { requestId: "r1", sessionId: "rt_a", mode: "direct" });
    emitStreamOpen(get, { requestId: "r2", sessionId: "rt_a", mode: "proxy" });

    get().togglePin("r1");
    get().clearRequests();

    expect(get().requests).toHaveLength(1);
    expect(get().requests[0]?.id).toBe("r1");
  });

  it("runs the session timer from when Studio saw the first runtime arrive", () => {
    const get = freshStore();
    expect(get().sessionStartedAt).toBeNull();

    get().setBindingSnapshot(snapshot(["rt_a"], ["api"]));
    expect(get().sessionStartedAt).toBe(ACTIVE_SINCE);

    // A second snapshot with more runtimes does not reset the timer
    get().setBindingSnapshot(snapshot(["rt_a", "rt_b"], ["api", "users"]));
    expect(get().sessionStartedAt).toBe(ACTIVE_SINCE);

    // Dropping all runtimes clears the timer
    get().setBindingSnapshot(snapshot([], []));
    expect(get().sessionStartedAt).toBeNull();
  });

  it("auto-clears lastBindingError when the conflict row is no longer present", () => {
    const get = freshStore();
    get().setBindingError({
      kind: "conflict",
      details: { sourceName: "api", transport: "http", runtimeIds: ["a", "b"] },
    });
    expect(get().lastBindingError).not.toBeNull();

    // Conflict resolves: new snapshot has the source bound to a single runtime
    get().setBindingSnapshot({
      rows: [{ sourceName: "api", transport: "http", status: "bound", runtimeId: "a" }],
      runtimeCount: 1,
      sourceCount: 1,
      runtimes: [{ runtimeId: "a", kind: "server" }],
    });

    expect(get().lastBindingError).toBeNull();
  });

  it("preserves lastBindingError when the same conflict row is still present", () => {
    const get = freshStore();
    get().setBindingError({
      kind: "conflict",
      details: { sourceName: "api", transport: "http", runtimeIds: ["a", "b"] },
    });

    // Snapshot still shows the conflict
    get().setBindingSnapshot({
      rows: [{ sourceName: "api", transport: "http", status: "conflict", conflicting: ["a", "b"] }],
      runtimeCount: 0,
      sourceCount: 0,
      runtimes: [],
    });

    expect(get().lastBindingError).not.toBeNull();
    expect(get().lastBindingError?.details.sourceName).toBe("api");
  });

  it("setBindingError stores and clears the latest binding error", () => {
    const get = freshStore();
    expect(get().lastBindingError).toBeNull();

    get().setBindingError({
      kind: "conflict",
      details: { sourceName: "api", transport: "http", runtimeIds: ["a", "b"] },
    });
    expect(get().lastBindingError?.kind).toBe("conflict");
    expect(get().lastBindingError?.details.runtimeIds).toEqual(["a", "b"]);

    get().setBindingError(null);
    expect(get().lastBindingError).toBeNull();
  });
});
