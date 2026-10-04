/**
 * The capture panel's log before the first request: where Studio serves,
 * the config, the files watched, and the apps attached — or the wait.
 */
import { describe, expect, it } from "vitest";

import { captureLog } from "@/screens/welcome/capture-log";

const base = {
  host: "localhost:6280",
  config: null,
  watched: 0,
  apps: [],
  attachedSince: undefined,
};

describe("captureLog", () => {
  it("says where Studio serves, that the config loads, and that it waits for an app", () => {
    expect(captureLog(base).map((l) => [l.tag, l.message])).toEqual([
      ["studio", "serving on http://localhost:6280"],
      ["config", "loading courier.config…"],
      ["runtime", "waiting for an app to attach…"],
    ]);
  });

  it("dates the loaded config and the attached apps, and counts the files watched", () => {
    const lines = captureLog({
      ...base,
      config: { state: "loaded", revision: 1, configFile: "courier.config.ts", loadedAt: 42 },
      watched: 3,
      apps: [{ id: "vite-browser", kind: "browser", origin: "localhost:5173" }],
      attachedSince: 99,
    });

    expect(lines.slice(1).map((l) => [l.at, l.message])).toEqual([
      [42, "courier.config.ts loaded"],
      [undefined, "watching 3 files"],
      [99, "vite-browser attached · browser"],
    ]);
  });

  it("says when the config does not load, or the project has none", () => {
    const failed = captureLog({
      ...base,
      config: {
        state: "failed",
        revision: 2,
        configFile: null,
        error: { code: "E", message: "x" },
        failedAt: 7,
        lastGoodAt: null,
      },
    });
    const missing = captureLog({
      ...base,
      config: { state: "missing", revision: 1, configFile: null, lastGoodAt: null },
    });

    expect(failed[1]).toEqual({ at: 7, tag: "config", message: "courier.config does not load" });
    expect(missing[1]?.message).toBe("no courier.config in the project");
  });
});
