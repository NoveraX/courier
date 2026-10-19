/**
 * `apisPageState` decides what the APIs page shows. The page waits only for
 * what it cannot know yet: once Studio tells how the config loads, every
 * state has a page of its own, and Import is refused while the config does
 * not load. Cut off from Studio, it shows what it was told last, or that
 * Studio cannot be reached — it waits only for its first connection.
 */

import { describe, expect, it } from "vitest";
import { apisPageState } from "../src/features/apis/apis-page-state";
import type { ConfigStatusPayload } from "../src/store/config-status";

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
  it("shows the skeleton while the page first connects", () => {
    const page = apisPageState({ connection: "connecting", status: null, sourceCount: 0 });

    expect(page).toEqual({ kind: "connecting", importBlocked: "Studio is not connected" });
  });

  it("says Studio cannot be reached, instead of loading, when it never told the page anything", () => {
    for (const connection of ["disconnected", "reconnecting"] as const) {
      expect(apisPageState({ connection, status: null, sourceCount: 0 })).toEqual({
        kind: "unreachable",
        importBlocked: "Studio is not connected",
      });
    }
    expect(
      apisPageState({
        connection: "disconnected",
        status: { state: "starting", revision: 0 },
        sourceCount: 0,
      }).kind,
    ).toBe("unreachable");
  });

  it("keeps what Studio told last once the page loses it, and refuses Import", () => {
    expect(apisPageState({ connection: "disconnected", status: LOADED, sourceCount: 4 })).toEqual({
      kind: "sources",
      notice: null,
      importBlocked: "Studio is not connected",
    });
    expect(
      apisPageState({ connection: "reconnecting", status: missing(null), sourceCount: 0 }),
    ).toEqual({ kind: "no-config", importBlocked: "Studio is not connected" });
    expect(
      apisPageState({
        connection: "disconnected",
        status: { state: "starting", revision: 0 },
        sourceCount: 2,
      }).kind,
    ).toBe("sources");
  });

  it("shows the skeleton until Studio tells how the config loads", () => {
    expect(apisPageState({ connection: "connected", status: null, sourceCount: 0 })).toEqual({
      kind: "loading",
      importBlocked: "Waiting for Studio",
    });
    expect(
      apisPageState({
        connection: "connected",
        status: { state: "starting", revision: 0 },
        sourceCount: 0,
      }),
    ).toEqual({ kind: "loading", importBlocked: "Studio is still loading courier.config" });
  });

  it("leaves the skeleton for a project without courier.config", () => {
    const page = apisPageState({ connection: "connected", status: missing(null), sourceCount: 0 });

    expect(page).toEqual({ kind: "no-config", importBlocked: "Create courier.config.ts first" });
  });

  it("leaves the skeleton for a project whose config never loaded", () => {
    const page = apisPageState({ connection: "connected", status: failed(null), sourceCount: 0 });

    expect(page).toEqual({
      kind: "broken",
      configFile: "courier.config",
      message: "Unexpected token (3:7)",
      importBlocked: "courier.config does not load; fix it first",
    });
  });

  it("shows the last good sources with an error notice when the config fails, naming no file: the one that failed may be another", () => {
    const status = failed(1_000, "courier.config.ts");

    const page = apisPageState({ connection: "connected", status, sourceCount: 3 });

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
    const page = apisPageState({ connection: "connected", status: missing(1_000), sourceCount: 3 });

    expect(page).toEqual({
      kind: "sources",
      notice: { tone: "warning", configFile: "courier.config.ts", lastGoodAt: 1_000 },
      importBlocked: "courier.config.ts was deleted; restore it first",
    });
  });

  it("names the file Studio ran when it was deleted, whatever its extension", () => {
    const status = missing(1_000, "courier.config.mjs");

    const page = apisPageState({ connection: "connected", status, sourceCount: 3 });

    expect(page).toEqual({
      kind: "sources",
      notice: { tone: "warning", configFile: "courier.config.mjs", lastGoodAt: 1_000 },
      importBlocked: "courier.config.mjs was deleted; restore it first",
    });
  });

  it("keeps the notice when the config Studio still runs declared no sources", () => {
    const page = apisPageState({ connection: "connected", status: missing(1_000), sourceCount: 0 });

    expect(page.kind).toBe("empty");
    expect(page.kind === "empty" && page.notice?.tone).toBe("warning");
  });

  it("shows the sources of a config that loads, and allows Import", () => {
    expect(apisPageState({ connection: "connected", status: LOADED, sourceCount: 2 })).toEqual({
      kind: "sources",
      notice: null,
      importBlocked: null,
    });
  });

  it("shows the empty page for a config that loads and declares no sources", () => {
    expect(apisPageState({ connection: "connected", status: LOADED, sourceCount: 0 })).toEqual({
      kind: "empty",
      notice: null,
      importBlocked: null,
    });
  });

  it("allows Import only while the config loads", () => {
    const blocked = [
      apisPageState({ connection: "disconnected", status: null, sourceCount: 0 }),
      apisPageState({ connection: "connected", status: null, sourceCount: 0 }),
      apisPageState({
        connection: "connected",
        status: { state: "starting", revision: 0 },
        sourceCount: 0,
      }),
      apisPageState({ connection: "connected", status: failed(null), sourceCount: 0 }),
      apisPageState({ connection: "connected", status: failed(1_000), sourceCount: 1 }),
      apisPageState({ connection: "connected", status: missing(null), sourceCount: 0 }),
      apisPageState({ connection: "connected", status: missing(1_000), sourceCount: 1 }),
    ];

    for (const page of blocked) expect(page.importBlocked).toEqual(expect.any(String));
    expect(
      apisPageState({ connection: "connected", status: LOADED, sourceCount: 0 }).importBlocked,
    ).toBeNull();
  });
});
