/**
 * `configTransitionNotice` decides what a change of the config's status
 * tells the user. The API sources reload notice waits for the load, so a
 * save that breaks the config is never announced as a reload, and it leaves
 * out the mocks file, which is not an API source.
 */

import { describe, expect, it } from "vitest";

import type { ConfigStatusPayload } from "../src/store/config-status";
import type { ConfigReloadContext } from "../src/store/config-transition";
import { configTransitionNotice } from "../src/store/config-transition";
import type { MocksFileStatus } from "../src/store/mocks-file-status";

const STARTING: ConfigStatusPayload = { state: "starting", revision: 0 };

function loaded(revision: number, loadedAt: number, configFile = "courier.config.ts") {
  return { state: "loaded", revision, configFile, loadedAt } satisfies ConfigStatusPayload;
}

function failed(revision: number, lastGoodAt: number | null): ConfigStatusPayload {
  return {
    state: "failed",
    revision,
    configFile: lastGoodAt === null ? null : "courier.config.ts",
    error: { code: "CONFIG_INVALID", message: "Unexpected token (3:7)" },
    failedAt: 5_000,
    lastGoodAt,
  };
}

function missing(
  revision: number,
  lastGoodAt: number | null,
  configFile = lastGoodAt === null ? null : "courier.config.ts",
): ConfigStatusPayload {
  return { state: "missing", revision, configFile, lastGoodAt };
}

const QUIET: ConfigReloadContext = { lastChange: null, announceReloads: true, mocks: null };
const MOCKS_FILE = "/project/courier.mocks.ts";

function changed(
  files: string[],
  timestamp: number,
  mocks: MocksFileStatus | null = null,
): ConfigReloadContext {
  return { lastChange: { files, timestamp }, announceReloads: true, mocks };
}

describe("configTransitionNotice", () => {
  it("says nothing for the replay after connecting", () => {
    expect(configTransitionNotice(null, loaded(4, 1_000), QUIET)).toBeNull();
    expect(configTransitionNotice(null, failed(4, 1_000), QUIET)).toBeNull();
    expect(configTransitionNotice(null, missing(4, null), QUIET)).toBeNull();
  });

  it("says nothing about the first load's outcome", () => {
    expect(configTransitionNotice(STARTING, loaded(1, 1_000), changed(["a.ts"], 900))).toBeNull();
    expect(configTransitionNotice(STARTING, failed(1, null), QUIET)).toBeNull();
    expect(configTransitionNotice(STARTING, missing(1, null), QUIET)).toBeNull();
  });

  it("announces an error when the config stops loading, naming no file: the one that failed may be another", () => {
    const notice = configTransitionNotice(loaded(2, 1_000), failed(3, 1_000), QUIET);

    expect(notice).toEqual({
      tone: "error",
      text: "courier.config stopped loading: Unexpected token (3:7)",
    });
  });

  it("says nothing while the config keeps failing", () => {
    expect(configTransitionNotice(failed(3, 1_000), failed(4, 1_000), QUIET)).toBeNull();
  });

  it("announces that the config loads again", () => {
    expect(configTransitionNotice(failed(3, 1_000), loaded(4, 6_000), QUIET)).toEqual({
      tone: "success",
      text: "courier.config.ts loads again",
    });
    expect(configTransitionNotice(missing(3, 1_000), loaded(4, 6_000), QUIET)).toEqual({
      tone: "success",
      text: "courier.config.ts loads again",
    });
  });

  it("announces a config that loads for the first time since Studio started", () => {
    expect(configTransitionNotice(failed(1, null), loaded(2, 6_000), QUIET)).toEqual({
      tone: "success",
      text: "courier.config.ts loads",
    });
    expect(configTransitionNotice(missing(1, null), loaded(2, 6_000), QUIET)).toEqual({
      tone: "success",
      text: "courier.config.ts loads",
    });
  });

  it("announces a reload only after it loaded, with the file that changed", () => {
    const reload = changed(["/project/src/api.ts"], 1_500);

    expect(configTransitionNotice(loaded(2, 1_000), failed(3, 1_000), reload)?.tone).toBe("error");
    expect(configTransitionNotice(loaded(2, 1_000), loaded(3, 2_000), reload)).toEqual({
      tone: "info",
      text: "API sources reloaded — /project/src/api.ts",
    });
  });

  it("counts the files of a reload that several changed", () => {
    const notice = configTransitionNotice(
      loaded(2, 1_000),
      loaded(3, 2_000),
      changed(["/project/src/a.ts", "/project/src/b.ts"], 1_500),
    );

    expect(notice).toEqual({ tone: "info", text: "API sources reloaded — 2 files" });
  });

  it("says nothing about a reload when file-change toasts are off", () => {
    const reload: ConfigReloadContext = {
      lastChange: { files: ["/project/src/api.ts"], timestamp: 1_500 },
      announceReloads: false,
      mocks: null,
    };

    expect(configTransitionNotice(loaded(2, 1_000), loaded(3, 2_000), reload)).toBeNull();
  });

  it("says nothing about a load that no reported change caused", () => {
    expect(configTransitionNotice(loaded(2, 1_000), loaded(3, 2_000), QUIET)).toBeNull();
    expect(
      configTransitionNotice(loaded(2, 1_000), loaded(3, 2_000), changed(["/p/old.ts"], 900)),
    ).toBeNull();
  });

  it("warns when the config is deleted, naming the file Studio ran", () => {
    expect(configTransitionNotice(loaded(2, 1_000), missing(3, 1_000), QUIET)).toEqual({
      tone: "warning",
      text: "courier.config.ts was deleted",
    });
    expect(
      configTransitionNotice(
        loaded(2, 1_000, "courier.config.mjs"),
        missing(3, 1_000, "courier.config.mjs"),
        QUIET,
      ),
    ).toEqual({ tone: "warning", text: "courier.config.mjs was deleted" });
    expect(configTransitionNotice(failed(3, null), missing(4, null), QUIET)).toEqual({
      tone: "warning",
      text: "courier.config was deleted",
    });
  });

  it("leaves the mocks file out of a reload, and says nothing when it alone changed", () => {
    const mocks = { file: MOCKS_FILE, error: null };

    expect(
      configTransitionNotice(
        loaded(2, 1_000),
        loaded(3, 2_000),
        changed([MOCKS_FILE], 1_500, mocks),
      ),
    ).toBeNull();
    expect(
      configTransitionNotice(
        loaded(2, 1_000),
        loaded(3, 2_000),
        changed([MOCKS_FILE, "/project/src/api.ts"], 1_500, mocks),
      ),
    ).toEqual({ tone: "info", text: "API sources reloaded — /project/src/api.ts" });
  });

  it("announces no reload while the mocks file does not load", () => {
    const mocks = { file: MOCKS_FILE, error: "ParseError: Unexpected token courier.mocks.ts:2:0" };

    for (const files of [[MOCKS_FILE], ["/project/src/api.ts"]]) {
      expect(
        configTransitionNotice(loaded(2, 1_000), loaded(3, 2_000), changed(files, 1_500, mocks)),
      ).toBeNull();
    }
  });

  it("says nothing while the config stays missing", () => {
    expect(configTransitionNotice(missing(3, 1_000), missing(4, 1_000), QUIET)).toBeNull();
  });

  it("says nothing about an outcome the UI has already seen", () => {
    expect(configTransitionNotice(loaded(3, 1_000), failed(3, 1_000), QUIET)).toBeNull();
    expect(configTransitionNotice(failed(5, 1_000), loaded(4, 1_000), QUIET)).toBeNull();
  });
});
