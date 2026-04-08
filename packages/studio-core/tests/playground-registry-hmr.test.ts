/**
 * Regression coverage for the fix that moves Playground state Maps onto
 * `globalThis` via `Symbol.for` so they survive HMR / Turbopack module
 * duplication.
 *
 * Before the fix, three module-scoped collections in
 * `playground-stream.ts` and `playground-ws-send.ts` were re-created on
 * every HMR reload — leaving previously-active streams orphaned (their
 * AbortControllers unreachable but their executors still running) and
 * leaving WS channels in the new module instance unable to find connections
 * registered by the old module instance.
 *
 * The Symbol.for pattern is the same one already used by
 * `playgroundAbortRegistry`, `studioHooks`, and `appOrigin`. The test
 * exercises the invariant: two independent module loads (simulated via
 * `vi.resetModules`) must observe the same backing storage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STREAMS_KEY = Symbol.for("nexus.studio.playground-active-streams");
const CHANNEL_REGISTRY_KEY = Symbol.for("nexus.studio.playground-channel-registry");
const CONNECTION_MAP_KEY = Symbol.for("nexus.studio.playground-ws-connection-map");
const SUBSCRIPTION_SET_KEY = Symbol.for("nexus.studio.playground-ws-subscription-set");

const g = globalThis as Record<symbol, unknown>;

beforeEach(() => {
  delete g[STREAMS_KEY];
  delete g[CHANNEL_REGISTRY_KEY];
  delete g[CONNECTION_MAP_KEY];
  delete g[SUBSCRIPTION_SET_KEY];
  vi.resetModules();
});

afterEach(() => {
  delete g[STREAMS_KEY];
  delete g[CHANNEL_REGISTRY_KEY];
  delete g[CONNECTION_MAP_KEY];
  delete g[SUBSCRIPTION_SET_KEY];
});

describe("playground-stream activeStreams — HMR survival", () => {
  it("uses globalThis-backed storage so two module loads share the same Map", async () => {
    const first = await import("../src/connect/playground-stream");
    expect(first.activeStreamCount()).toBe(0);

    // Simulate the registration that handlePlaygroundStream would perform.
    // We poke the global directly to avoid wiring a real executor.
    const sharedMap = g[STREAMS_KEY] as Map<string, AbortController>;
    sharedMap.set("rid-1", new AbortController());
    expect(first.activeStreamCount()).toBe(1);

    // Simulate Next.js HMR: drop module cache, re-import.
    vi.resetModules();
    const second = await import("../src/connect/playground-stream");

    // The second module instance must see the entry registered before
    // reload — proving it shares storage with the first instance.
    expect(second.activeStreamCount()).toBe(1);
  });

  it("cancelAllPlaygroundStreams clears the same Map across reloads", async () => {
    const first = await import("../src/connect/playground-stream");
    const sharedMap = g[STREAMS_KEY] as Map<string, AbortController>;
    sharedMap.set("rid-1", new AbortController());
    sharedMap.set("rid-2", new AbortController());
    expect(first.activeStreamCount()).toBe(2);

    vi.resetModules();
    const second = await import("../src/connect/playground-stream");
    expect(second.activeStreamCount()).toBe(2);

    expect(second.cancelAllPlaygroundStreams()).toBe(2);
    expect(second.activeStreamCount()).toBe(0);
  });
});

describe("playground-ws-send registries — HMR survival", () => {
  it("playgroundChannelRegistry uses globalThis-backed storage", async () => {
    const first = await import("../src/connect/playground-ws-send");
    expect(first.playgroundChannelCount()).toBe(0);

    // Register a stub channel via the shared global, then re-import.
    const sharedMap = g[CHANNEL_REGISTRY_KEY] as Map<string, unknown>;
    sharedMap.set("rid-ws-1", { send: vi.fn(), close: vi.fn() });
    expect(first.playgroundChannelCount()).toBe(1);

    vi.resetModules();
    const second = await import("../src/connect/playground-ws-send");
    expect(second.playgroundChannelCount()).toBe(1);
  });

  it("trackWSStream + untrackWSStream survive module reload", async () => {
    const first = await import("../src/connect/playground-ws-send");
    first.trackWSStream("rid-real-1", "conn-1", "topic.a");

    // The connection map and subscription set must both survive.
    expect((g[CONNECTION_MAP_KEY] as Map<string, string>).get("rid-real-1")).toBe("conn-1");
    expect((g[SUBSCRIPTION_SET_KEY] as Set<string>).has("rid-real-1:topic.a")).toBe(true);

    vi.resetModules();
    const second = await import("../src/connect/playground-ws-send");

    // The second module instance still observes the tracked stream — and
    // can untrack it via its own exported function.
    second.untrackWSStream("rid-real-1");
    expect((g[CONNECTION_MAP_KEY] as Map<string, string>).has("rid-real-1")).toBe(false);
    expect((g[SUBSCRIPTION_SET_KEY] as Set<string>).has("rid-real-1:topic.a")).toBe(false);
  });
});
