/**
 * Studio's runtime in a Cloudflare Worker, which takes its browser build:
 * the Worker may open no connection as it loads, and one a request opens
 * serves that request alone, so the runtime attaches nothing there — no
 * hooks, no socket, nothing of the platform's to observe — and says so once,
 * in development. The Worker here is what `wrangler dev` runs: workerd names
 * itself in `navigator.userAgent`, and the `PerformanceObserver` that
 * `nodejs_compat` brings throws as it is asked to observe.
 */
import { studioHooks } from "@noverax/courier/internal-studio";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attachRuntime } from "../src/runtime/attach-runtime-browser";
import { _resetRuntimeHandlesForTests } from "../src/runtime/attach-runtime-core";

class UnimplementedObserver {
  static readonly supportedEntryTypes: readonly string[] = [];
  observe(): void {
    throw new Error("[unenv] PerformanceObserver.observe is not implemented yet!");
  }
  disconnect(): void {}
}

let said: string[] = [];

beforeEach(() => {
  vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
  vi.stubGlobal("PerformanceObserver", UnimplementedObserver);
  said = [];
  vi.spyOn(console, "info").mockImplementation((_format: unknown, line: unknown) => {
    said.push(String(line));
  });
});

afterEach(() => {
  _resetRuntimeHandlesForTests();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Studio's runtime in a Cloudflare Worker", () => {
  it("attaches nothing, and says so once", async () => {
    const handle = await attachRuntime("worker");
    const again = await attachRuntime("worker");

    expect(again).toBe(handle);
    expect(handle).toMatchObject({ runtimeId: "worker", kind: "server" });
    expect(handle.config()).toBeUndefined();
    expect(studioHooks.onRequestStart).toBeUndefined();
    expect(studioHooks.onHttpFetchStart).toBeUndefined();
    expect(said).toHaveLength(1);
    expect(said[0]).toContain(
      "Studio's runtime attaches nothing in a Cloudflare Worker, which keeps no connection open between requests",
    );
  });

  it("says nothing in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const handle = await attachRuntime("worker");

    expect(handle.runtimeId).toBe("worker");
    expect(said).toEqual([]);
  });
});
