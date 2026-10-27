/**
 * @vitest-environment jsdom
 */

import diagnostics from "node:diagnostics_channel";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetAnnouncements } from "../../core/src/announce/test-support";
import { _resetRuntimeHandlesForTests, attachRuntime } from "../src/runtime/attach-runtime";

const STUDIO_URL_KEY = Symbol.for("courier.studio.url");

afterEach(() => {
  _resetRuntimeHandlesForTests();
  resetAnnouncements();
  vi.restoreAllMocks();
  delete (globalThis as Record<symbol, unknown>)[STUDIO_URL_KEY];
});

describe("attachRuntime (browser context)", () => {
  it("reports kind=browser when window+document exist", async () => {
    const handle = await attachRuntime("test-browser-1");
    expect(handle.kind).toBe("browser");
  });

  it("returns the same handle on repeated calls with the same id", async () => {
    const a = await attachRuntime("test-browser-2");
    const b = await attachRuntime("test-browser-2");
    expect(a).toBe(b);
  });

  it("auto-derives a default runtime id when none is passed", async () => {
    const handle = await attachRuntime();
    expect(handle.kind).toBe("browser");
    expect(handle.runtimeId).toBe("browser");
  });

  it("leaves Node's diagnostics channel alone, which a bundler gives a page only a stand-in for", async () => {
    const subscribe = vi.spyOn(diagnostics, "subscribe");

    await attachRuntime("test-browser-4");

    expect(subscribe).not.toHaveBeenCalled();
  });

  it("honours the globalThis Studio URL slot for connection target", async () => {
    (globalThis as Record<symbol, unknown>)[STUDIO_URL_KEY] = "http://10.0.0.5:7777";
    const handle = await attachRuntime("test-browser-3");
    expect(handle.kind).toBe("browser");
    // The Studio URL is read internally by connectRuntimeSocket; the test
    // can't peek inside the socket but verifies attach succeeds with a
    // non-default URL slot present.
  });
});
