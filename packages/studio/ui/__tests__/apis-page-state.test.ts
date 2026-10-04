/**
 * `apisPageState` decides what the APIs page shows. The page waits only for
 * what it cannot know yet: once Studio tells how the config loads, every
 * state has a page of its own, and Import is refused while the config does
 * not load.
 */

import { describe, expect, it } from "vitest";

import type { ConfigStatusPayload } from "../src/store/config-status";

import { apisPageState } from "../src/views/apis/apis-page-state";

const LOADED: ConfigStatusPayload = {
  state: "loaded",
  revision: 2,
  configFile: "courier.config.ts",
  loadedAt: 1_000,
};

function failed(lastGoodAt: number | null, configFile: string | null = null): ConfigStatusPayload {
  return {
    state: "failed",
    revision: 3,
    configFile,
    error: { code: "CONFIG_INVALID", message: "Unexpected token (3:7)" },
    failedAt: 2_000,
    lastGoodAt,
  };
}

function missing(
  lastGoodAt: number | null,
  configFile = lastGoodAt === null ? null : "courier.config.ts",
): ConfigStatusPayload {
  return { state: "missing", revision: 3, configFile, missingAt: 2_000, lastGoodAt };
}

describe("apisPageState", () => {
  it("shows the skeleton while the UI is not connected", () => {
    const page = apisPageState({ connected: false, status: LOADED, sourceCount: 4 });

    expect(page.kind).toBe("connecting");
    expect(page.importBlocked).toBe("Studio is not connected");
  });

  it("shows the skeleton until Studio tells how the config loads", () => {
    expect(apisPageState({ connected: true, status: null, sourceCount: 0 })).toEqual({
      kind: "loading",
      importBlocked: "Waiting for Studio",
    });
    expect(
      apisPageState({
        connected: true,
        status: { state: "starting", revision: 0 },
        sourceCount: 0,
      }),
    ).toEqual({ kind: "loading", importBlocked: "Studio is still loading courier.config" });
  });

  it("leaves the skeleton for a project without courier.config", () => {
    const page = apisPageState({ connected: true, status: missing(null), sourceCount: 0 });

    expect(page).toEqual({ kind: "no-config", importBlocked: "Create courier.config.ts first" });
  });

  it("leaves the skeleton for a project whose config never loaded", () => {
    const page = apisPageState({ connected: true, status: failed(null), sourceCount: 0 });

    expect(page).toEqual({
      kind: "broken",
      configFile: "courier.config",
      message: "Unexpected token (3:7)",
      importBlocked: "courier.config does not load; fix it first",
    });
  });

  it("shows the last good sources with an error notice when the config fails, naming no file: the one that failed may be another", () => {
    const status = failed(1_000, "courier.config.ts");

    const page = apisPageState({ connected: true, status, sourceCount: 3 });

    expect(page).toEqual({
      kind: "sources",
      notice: {
        tone: "error",
        configFile: "courier.config",
        message: "Unexpected token (3:7)",
        lastGoodAt: 1_000,
      },
      importBlocked: "courier.config does not load; fix it first",
    });
  });

  it("shows the last good sources with a warning notice when the config was deleted", () => {
    const page = apisPageState({ connected: true, status: missing(1_000), sourceCount: 3 });

    expect(page).toEqual({
      kind: "sources",
      notice: { tone: "warning", configFile: "courier.config.ts", lastGoodAt: 1_000 },
      importBlocked: "courier.config.ts was deleted; restore it first",
    });
  });

  it("names the file Studio ran when it was deleted, whatever its extension", () => {
    const status = missing(1_000, "courier.config.mjs");

    const page = apisPageState({ connected: true, status, sourceCount: 3 });

    expect(page).toEqual({
      kind: "sources",
      notice: { tone: "warning", configFile: "courier.config.mjs", lastGoodAt: 1_000 },
      importBlocked: "courier.config.mjs was deleted; restore it first",
    });
  });

  it("keeps the notice when the config Studio still runs declared no sources", () => {
    const page = apisPageState({ connected: true, status: missing(1_000), sourceCount: 0 });

    expect(page.kind).toBe("empty");
    expect(page.kind === "empty" && page.notice?.tone).toBe("warning");
  });

  it("shows the sources of a config that loads, and allows Import", () => {
    expect(apisPageState({ connected: true, status: LOADED, sourceCount: 2 })).toEqual({
      kind: "sources",
      notice: null,
      importBlocked: null,
    });
  });

  it("shows the empty page for a config that loads and declares no sources", () => {
    expect(apisPageState({ connected: true, status: LOADED, sourceCount: 0 })).toEqual({
      kind: "empty",
      notice: null,
      importBlocked: null,
    });
  });

  it("allows Import only while the config loads", () => {
    const blocked = [
      apisPageState({ connected: false, status: null, sourceCount: 0 }),
      apisPageState({ connected: true, status: null, sourceCount: 0 }),
      apisPageState({
        connected: true,
        status: { state: "starting", revision: 0 },
        sourceCount: 0,
      }),
      apisPageState({ connected: true, status: failed(null), sourceCount: 0 }),
      apisPageState({ connected: true, status: failed(1_000), sourceCount: 1 }),
      apisPageState({ connected: true, status: missing(null), sourceCount: 0 }),
      apisPageState({ connected: true, status: missing(1_000), sourceCount: 1 }),
    ];

    for (const page of blocked) expect(page.importBlocked).toEqual(expect.any(String));
    expect(
      apisPageState({ connected: true, status: LOADED, sourceCount: 0 }).importBlocked,
    ).toBeNull();
  });
});
