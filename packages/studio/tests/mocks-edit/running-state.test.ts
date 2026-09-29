/**
 * What the mock wizard is told about the config Studio runs: a config that
 * is missing reads as no config, even while Studio still runs the one it
 * loaded before; one that does not load reads as failing, whether or not
 * one ever loaded.
 */
import { describe, expect, it } from "vitest";

import type { LoadedCourierConfig } from "../../src/server/config-loader";
import { ConfigLoaderError, ConfigNotFoundError } from "../../src/server/config-loader-errors";
import { MocksEditRefusal } from "../../src/server/mocks-edit/mocks-edit-refusal";
import { type LoadState, runningState } from "../../src/server/mocks-edit/running-state";
import { failureOf } from "../../src/server/project-state/failure-of";

const ROOT = "/app";

const loaded: LoadedCourierConfig = {
  config: { sources: {} },
  configFile: `${ROOT}/courier.config.ts`,
  contentHash: null,
  deps: [],
  depHashes: new Map(),
  mocks: { file: null, entries: {}, contentHash: null, error: null },
};

const missing = failureOf(new ConfigNotFoundError(ROOT), ROOT);
const broken = failureOf(
  new ConfigLoaderError(
    "CONFIG_INVALID",
    `Failed to load courier.config: Cannot find module ${ROOT}/src/gone`,
  ),
  ROOT,
);

function refusal(state: LoadState): MocksEditRefusal {
  try {
    runningState(state, ROOT);
  } catch (err) {
    if (err instanceof MocksEditRefusal) return err;
    throw err;
  }
  throw new Error("runningState did not refuse");
}

describe("runningState", () => {
  it("reports no config once courier.config was deleted, while Studio runs what it loaded", () => {
    expect(refusal({ running: loaded, failure: missing }).code).toBe("NO_CONFIG");
  });

  it("reports a config that never loaded as failing, with the loader's message", () => {
    const reason = refusal({ running: null, failure: broken });

    expect(reason.code).toBe("CONFIG_LOAD_FAILING");
    expect(reason.message).toContain("Cannot find module src/gone");
  });

  it("reports a config that stopped loading as failing, while Studio runs the last one", () => {
    expect(refusal({ running: loaded, failure: broken }).code).toBe("CONFIG_LOAD_FAILING");
  });

  it("reports no config when none ever ran and nothing failed", () => {
    expect(refusal({ running: null, failure: null }).code).toBe("NO_CONFIG");
  });

  it("returns what Studio runs when it loads", () => {
    expect(runningState({ running: loaded, failure: null }, ROOT)).toBe(loaded);
  });
});
