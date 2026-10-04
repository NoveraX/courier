/**
 * The mock wizard offers sources only while `courier.config` loads; in
 * every other state it says why, and the buttons that open it are turned
 * off with the same reason.
 */
import { describe, expect, it } from "vitest";

import { sourceAvailability } from "../src/views/mocks/wizard/source-availability";

const LOADED = {
  state: "loaded",
  revision: 2,
  configFile: "courier.config.ts",
  loadedAt: 1,
} as const;

describe("sources for new mocks", () => {
  it("are offered while the config loads and declares some", () => {
    expect(sourceAvailability({ connected: true, status: LOADED, sourceCount: 2 })).toEqual({
      kind: "sources",
      blocked: null,
    });
    expect(sourceAvailability({ connected: true, status: LOADED, sourceCount: 0 })).toEqual({
      kind: "empty",
      blocked: null,
      configFile: "courier.config.ts",
    });
  });

  it("are not offered while Studio is disconnected or still loading", () => {
    expect(sourceAvailability({ connected: false, status: LOADED, sourceCount: 2 })).toEqual({
      kind: "connecting",
      blocked: "Studio is not connected",
    });
    expect(
      sourceAvailability({
        connected: true,
        status: { state: "starting", revision: 0 },
        sourceCount: 2,
      }),
    ).toEqual({ kind: "loading", blocked: "Studio is still loading courier.config" });
  });

  it("wait for Studio's word on the config, which a page that just connected has not had", () => {
    expect(sourceAvailability({ connected: true, status: null, sourceCount: 2 })).toEqual({
      kind: "loading",
      blocked: "Waiting for Studio",
    });
  });

  it("are not offered while the config fails to load, even with sources loaded before", () => {
    const failed = {
      state: "failed",
      revision: 3,
      configFile: "courier.config.ts",
      error: { code: "CONFIG_INVALID", message: "Unexpected token (3:7)" },
      failedAt: 2,
      lastGoodAt: 1,
    } as const;

    expect(sourceAvailability({ connected: true, status: failed, sourceCount: 2 })).toEqual({
      kind: "failed",
      blocked: "courier.config does not load; fix it first",
      configFile: "courier.config",
      message: "Unexpected token (3:7)",
    });
  });

  it("are not offered without a config, and a deleted one is told apart", () => {
    const never = { state: "missing", revision: 1, configFile: null, lastGoodAt: null } as const;
    const deleted = {
      state: "missing",
      revision: 4,
      configFile: "courier.config.ts",
      lastGoodAt: 1,
    } as const;

    expect(sourceAvailability({ connected: true, status: never, sourceCount: 0 })).toEqual({
      kind: "missing",
      blocked: "Create courier.config.ts first",
      deleted: false,
    });
    expect(sourceAvailability({ connected: true, status: deleted, sourceCount: 2 })).toEqual({
      kind: "missing",
      blocked: "courier.config.ts was deleted; restore it first",
      deleted: true,
    });
  });
});
