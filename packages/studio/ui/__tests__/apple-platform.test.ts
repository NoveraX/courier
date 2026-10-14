/**
 * Whether the page runs on an Apple keyboard's system: read from the
 * platform the browser reports, the older `navigator.platform` where it
 * reports none.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { isApplePlatform } from "@/lib/apple-platform";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isApplePlatform", () => {
  it.each([
    [{ userAgentData: { platform: "macOS" }, platform: "" }, true],
    [{ userAgentData: { platform: "Windows" }, platform: "MacIntel" }, false],
    [{ platform: "MacIntel" }, true],
    [{ platform: "iPhone" }, true],
    [{ platform: "Win32" }, false],
    [{ platform: "Linux x86_64" }, false],
    [{ userAgentData: { platform: "" }, platform: "MacIntel" }, true],
  ])("reads %j as %s", (navigator, apple) => {
    vi.stubGlobal("navigator", navigator);

    expect(isApplePlatform()).toBe(apple);
  });
});
