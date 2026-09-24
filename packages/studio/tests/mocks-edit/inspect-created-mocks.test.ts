import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { inspectCreatedMocks } from "../../src/server/mocks-edit/inspect-created-mocks";
import { MocksEditRefusal } from "../../src/server/mocks-edit/mocks-edit-refusal";

/* Root may write anything, so permission bits cannot refuse it. */
const RUNS_AS_ROOT = process.getuid?.() === 0;
const NOTHING_THROWN = Symbol("nothing thrown");

let root: string;

function thrownBy(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  return NOTHING_THROWN;
}

function writeConfig(name: string): string {
  const config = join(root, name);
  writeFileSync(config, "export default { sources: {} };\n");
  return config;
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-inspect-created-")));
});

afterEach(() => {
  vi.restoreAllMocks();
  chmodSync(root, 0o755);
  rmSync(root, { recursive: true, force: true });
});

describe("inspectCreatedMocks", () => {
  it("names courier.mocks.ts beside a courier.config.ts", () => {
    const config = writeConfig("courier.config.ts");

    expect(inspectCreatedMocks(root, config)).toEqual({
      kind: "create",
      path: join(root, "courier.mocks.ts"),
      relative: "courier.mocks.ts",
      name: "courier.mocks.ts",
      configName: "courier.config.ts",
    });
  });

  it("names courier.mocks.mts beside a courier.config.mts", () => {
    const config = writeConfig("courier.config.mts");

    expect(inspectCreatedMocks(root, config)).toEqual({
      kind: "create",
      path: join(root, "courier.mocks.mts"),
      relative: "courier.mocks.mts",
      name: "courier.mocks.mts",
      configName: "courier.config.mts",
    });
  });

  it.each([
    ["courier.config.cts"],
    ["courier.config.js"],
    ["courier.config.mjs"],
    ["courier.config.cjs"],
  ])("names courier.mocks.ts beside a %s", (configName) => {
    const config = writeConfig(configName);

    expect(inspectCreatedMocks(root, config)).toMatchObject({
      name: "courier.mocks.ts",
      configName,
    });
  });

  it("refuses a symbolic link at courier.mocks.mjs", () => {
    const config = writeConfig("courier.config.ts");
    symlinkSync(join(root, "elsewhere.mjs"), join(root, "courier.mocks.mjs"));

    const error = thrownBy(() => inspectCreatedMocks(root, config));

    expect(error).toBeInstanceOf(MocksEditRefusal);
    expect(error).toMatchObject({
      code: "MOCKS_IS_LINK",
      message:
        "courier.mocks.mjs is a symbolic link. Studio edits and creates only a regular mocks file, so it leaves the link to you.",
    });
  });

  it("refuses when a mocks file appeared after the search found none", () => {
    const config = writeConfig("courier.config.ts");
    writeFileSync(join(root, "courier.mocks.cts"), "export default {};\n");

    const error = thrownBy(() => inspectCreatedMocks(root, config));

    expect(error).toMatchObject({
      code: "MOCKS_CHANGED_SINCE_LOAD",
      message:
        "courier.mocks.cts appeared while Studio was looking for the mocks file. Studio plans the edit once it has loaded it.",
    });
  });

  it("refuses a directory under a mocks file name as not a regular file", () => {
    const config = writeConfig("courier.config.ts");
    mkdirSync(join(root, "courier.mocks.cts"));

    const error = thrownBy(() => inspectCreatedMocks(root, config));

    expect(error).toMatchObject({
      code: "MOCKS_NOT_REGULAR",
      message:
        "courier.mocks.cts is a directory, so Studio cannot create or edit a mocks file there.",
    });
  });

  it("refuses when another user owns the project's config", () => {
    const config = writeConfig("courier.config.ts");
    const owner = statSync(config).uid;
    vi.spyOn(process, "getuid").mockReturnValue(owner + 1);

    const error = thrownBy(() => inspectCreatedMocks(root, config));

    expect(error).toMatchObject({
      code: "MOCKS_NOT_OWNED",
      message: `courier.config.ts belongs to user ${owner}, but Studio runs as user ${owner + 1}. A mocks file Studio created would belong to user ${owner + 1}, so Studio leaves creating it to the project's owner.`,
    });
  });

  it.skipIf(RUNS_AS_ROOT)("refuses when the project directory is read-only", () => {
    const config = writeConfig("courier.config.ts");
    chmodSync(root, 0o555);

    const error = thrownBy(() => inspectCreatedMocks(root, config));

    expect(error).toMatchObject({
      code: "MOCKS_NOT_WRITABLE",
      message:
        "Studio may not write the project directory (EACCES). Studio would create courier.mocks.ts there.",
    });
  });
});
