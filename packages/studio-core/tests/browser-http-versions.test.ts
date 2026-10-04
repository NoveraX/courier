/**
 * The HTTP versions a page's requests go over, from the Resource Timing the
 * browser keeps: the page's own protocol at once, a resource's as it is
 * timed, and nothing from an origin that keeps its timing to itself.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { observeBrowserHttpVersions } from "../src/runtime/http-versions/browser-http-versions";

type Notify = (list: { getEntries(): unknown[] }) => void;

function stubTiming(entries: Record<string, unknown[]>): { timed: (entry: unknown) => void } {
  let notify: Notify | undefined;
  vi.stubGlobal("performance", { getEntriesByType: (type: string) => entries[type] ?? [] });
  vi.stubGlobal(
    "PerformanceObserver",
    class {
      constructor(callback: Notify) {
        notify = callback;
      }
      observe(): void {}
      disconnect(): void {}
    },
  );
  return { timed: (entry) => notify?.({ getEntries: () => [entry] }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("observeBrowserHttpVersions", () => {
  it("tells the page's own version at once", () => {
    stubTiming({ navigation: [{ name: "https://app.example.com/", nextHopProtocol: "h2" }] });

    const versions = observeBrowserHttpVersions();

    expect(versions.versionOf("https://app.example.com/api/request")).toBe("HTTP/2");
  });

  it("tells a resource's version once the browser times it", () => {
    const { timed } = stubTiming({});
    const versions = observeBrowserHttpVersions();

    timed({ name: "https://api.example.com/users", nextHopProtocol: "h3" });

    expect(versions.versionOf("https://api.example.com/users/1")).toBe("HTTP/3");
  });

  it("tells nothing of an origin that keeps its timing to itself", () => {
    const { timed } = stubTiming({});
    const versions = observeBrowserHttpVersions();

    timed({ name: "https://closed.example.com/users", nextHopProtocol: "" });

    expect(versions.versionOf("https://closed.example.com/users")).toBeUndefined();
  });
});
