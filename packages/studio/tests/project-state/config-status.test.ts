/**
 * How `config:status` reads each state of the project Studio runs: the
 * config file relative to the project, the loader's code and one-line
 * message for a failure, and the file Studio runs and when it loaded it for
 * a failure or a config that went missing.
 */
import { describe, expect, it } from "vitest";

import type { LoadedCourierConfig } from "../../src/server/config-loader";
import { ConfigLoaderError, ConfigNotFoundError } from "../../src/server/config-loader-errors";
import { configStatusOf } from "../../src/server/project-state/config-status";
import { failureOf } from "../../src/server/project-state/failure-of";
import type { ProjectSnapshot } from "../../src/server/project-state/types";

const ROOT = "/app";

const loaded: LoadedCourierConfig = {
  config: { sources: {} },
  configFile: `${ROOT}/config/courier.config.ts`,
  contentHash: null,
  deps: [],
  mocks: { file: null, entries: {}, contentHash: null, error: null },
};

const STARTING: ProjectSnapshot = { revision: 0, starting: true, running: null, loadedAt: null, failure: null };
const broken = failureOf(
  new ConfigLoaderError("CONFIG_INVALID", `Failed to load courier.config:\n  Cannot find module ${ROOT}/src/gone`),
  ROOT,
  2_000,
);
const missing = failureOf(new ConfigNotFoundError(ROOT), ROOT, 3_000);

describe("configStatusOf", () => {
  it("reads a project with no outcome yet as starting", () => {
    expect(configStatusOf(STARTING, ROOT)).toEqual({ state: "starting", revision: 0 });
  });

  it("reads a load that succeeded as loaded, with its file relative to the project", () => {
    const snapshot = { ...STARTING, revision: 1, starting: false, running: loaded, loadedAt: 1_000 };

    expect(configStatusOf(snapshot, ROOT)).toEqual({
      state: "loaded",
      revision: 1,
      configFile: "config/courier.config.ts",
      loadedAt: 1_000,
    });
  });

  it("reads a config that never loaded as failed, with no file and nothing loaded before", () => {
    const snapshot = { ...STARTING, revision: 1, starting: false, failure: broken };

    expect(configStatusOf(snapshot, ROOT)).toEqual({
      state: "failed",
      revision: 1,
      configFile: null,
      error: { code: "CONFIG_INVALID", message: "Failed to load courier.config: Cannot find module src/gone" },
      failedAt: 2_000,
      lastGoodAt: null,
    });
  });

  it("reads a config that stopped loading as failed, with when Studio last loaded it", () => {
    const snapshot = { revision: 2, starting: false, running: loaded, loadedAt: 1_000, failure: broken };

    expect(configStatusOf(snapshot, ROOT)).toMatchObject({
      state: "failed",
      configFile: "config/courier.config.ts",
      lastGoodAt: 1_000,
    });
  });

  it("reads a deleted config as missing, naming the file Studio still runs and when it loaded it", () => {
    const snapshot = { revision: 3, starting: false, running: loaded, loadedAt: 1_000, failure: missing };

    expect(configStatusOf(snapshot, ROOT)).toEqual({
      state: "missing",
      revision: 3,
      configFile: "config/courier.config.ts",
      lastGoodAt: 1_000,
    });
  });

  it("reads a project that never had a config as missing, with no file and nothing loaded", () => {
    const snapshot = { ...STARTING, revision: 1, starting: false, failure: missing };

    expect(configStatusOf(snapshot, ROOT)).toEqual({
      state: "missing",
      revision: 1,
      configFile: null,
      lastGoodAt: null,
    });
  });
});
