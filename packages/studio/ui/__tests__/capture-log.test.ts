/**
 * The capture panel's log before the first request: where Studio serves,
 * the config, the files watched, and the apps attached — or the wait —
 * each at the time Studio gives for it.
 */
import { describe, expect, it } from "vitest";

import { captureLog } from "@/screens/welcome/capture-log";

const base = {
  host: "localhost:6280",
  startedAt: undefined,
  config: null,
  watched: 0,
  watchedSince: undefined,
  apps: [],
  attachedSince: undefined,
  idleSince: undefined,
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
      watchedSince: 43,
      apps: [{ id: "vite-browser", kind: "browser", origin: "localhost:5173" }],
      attachedSince: 99,
    });

    expect(lines.slice(1).map((l) => [l.at, l.message])).toEqual([
      [42, "courier.config.ts loaded"],
      [43, "watching 3 files"],
      [99, "vite-browser attached · browser"],
    ]);
  });

  it("dates Studio's start, the first load, and the wait — from the start, or since the last app left", () => {
    const fresh = captureLog({ ...base, startedAt: 10 });
    const left = captureLog({ ...base, startedAt: 10, idleSince: 50 });

    expect(fresh.map((l) => l.at)).toEqual([10, 10, 10]);
    expect(left.at(-1)).toEqual({
      at: 50,
      tag: "runtime",
      message: "waiting for an app to attach…",
    });
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
      config: { state: "missing", revision: 1, configFile: null, missingAt: 8, lastGoodAt: null },
    });

    expect(failed[1]).toEqual({ at: 7, tag: "config", message: "courier.config does not load" });
    expect(missing[1]).toEqual({
      at: 8,
      tag: "config",
      message: "no courier.config in the project",
    });
  });
});
