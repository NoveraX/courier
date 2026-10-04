/**
 * What the status bar says of a config Studio does not run as it is on disk.
 */
import { describe, expect, it } from "vitest";

import { configNotice } from "@/features/config/config-notice";

describe("configNotice", () => {
  it("says a config error with the loader's message", () => {
    const notice = configNotice({
      state: "failed",
      revision: 2,
      configFile: "courier.config.ts",
      error: { code: "E_SYNTAX", message: "Unexpected token" },
      failedAt: 1,
      lastGoodAt: null,
    });

    expect(notice).toEqual({
      label: "config error",
      title: "courier.config does not load: Unexpected token",
      failed: true,
    });
  });

  it("says a config Studio ran is deleted, and says nothing of one never had", () => {
    expect(
      configNotice({
        state: "missing",
        revision: 3,
        configFile: "courier.config.ts",
        lastGoodAt: 0,
      }),
    ).toMatchObject({ label: "config deleted", failed: false });
    expect(
      configNotice({ state: "missing", revision: 1, configFile: null, lastGoodAt: null }),
    ).toBeNull();
    expect(
      configNotice({ state: "loaded", revision: 1, configFile: "courier.config.ts", loadedAt: 1 }),
    ).toBeNull();
    expect(configNotice(null)).toBeNull();
  });
});
