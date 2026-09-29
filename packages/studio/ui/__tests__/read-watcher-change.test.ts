import { describe, expect, it } from "vitest";

import { readWatcherChange } from "../src/socket/read-watcher-change";

describe("readWatcherChange", () => {
  it("reads a change the watcher saw", () => {
    expect(readWatcherChange({ source: "mock", files: ["petstore"], timestamp: 5 })).toEqual({
      source: "mock",
      files: ["petstore"],
      timestamp: 5,
    });
  });

  /* The payload was read by checking one field and casting the rest. */
  it.each([
    [{ source: "disk", files: [], timestamp: 1 }],
    [{ source: "api", files: "courier.config.ts", timestamp: 1 }],
    [{ source: "api", files: [3], timestamp: 1 }],
    [{ source: "api", files: [] }],
    [null],
  ])("refuses %j", (payload) => {
    expect(readWatcherChange(payload)).toBeNull();
  });
});
