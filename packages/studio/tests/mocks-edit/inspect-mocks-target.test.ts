import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { inspectMocksTarget } from "../../src/server/mocks-edit/inspect-mocks-target";
import { MocksEditRefusal } from "../../src/server/mocks-edit/mocks-edit-refusal";

const MOCKS = "export default defineMocks({});\n";
const NOTHING_THROWN = Symbol("nothing thrown");

let root: string;
let outside: string;

function thrownBy(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  return NOTHING_THROWN;
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-mocks-target-")));
  outside = realpathSync(mkdtempSync(join(tmpdir(), "courier-mocks-target-link-")));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe("inspectMocksTarget", () => {
  it("refuses a project without a courier.config", () => {
    writeFileSync(join(root, "courier.mocks.ts"), MOCKS);

    const error = thrownBy(() => inspectMocksTarget(root));

    expect(error).toBeInstanceOf(MocksEditRefusal);
    expect(error).toMatchObject({
      code: "NO_CONFIG",
      message: "There is no courier.config in the project root. Declare your sources there first.",
    });
  });

  it("reads the project's courier.mocks.ts", () => {
    writeFileSync(join(root, "courier.config.ts"), "export default {};\n");
    writeFileSync(join(root, "courier.mocks.ts"), MOCKS);

    expect(inspectMocksTarget(root)).toMatchObject({
      kind: "existing",
      path: join(root, "courier.mocks.ts"),
      relative: "courier.mocks.ts",
      text: MOCKS,
      configName: "courier.config.ts",
    });
  });

  it("reads the mocks file Studio loads when there are several", () => {
    writeFileSync(join(root, "courier.config.mjs"), "export default {};\n");
    writeFileSync(join(root, "courier.mocks.mts"), MOCKS);
    writeFileSync(join(root, "courier.mocks.cts"), "module.exports = {};\n");

    expect(inspectMocksTarget(root)).toMatchObject({
      kind: "existing",
      name: "courier.mocks.mts",
      configName: "courier.config.mjs",
    });
  });

  it("plans to create courier.mocks.ts when the project has no mocks file", () => {
    writeFileSync(join(root, "courier.config.ts"), "export default {};\n");

    expect(inspectMocksTarget(root)).toEqual({
      kind: "create",
      path: join(root, "courier.mocks.ts"),
      relative: "courier.mocks.ts",
      name: "courier.mocks.ts",
      configName: "courier.config.ts",
    });
  });

  it("plans to create courier.mocks.mts beside a courier.config.mts", () => {
    writeFileSync(join(root, "courier.config.mts"), "export default {};\n");

    expect(inspectMocksTarget(root)).toMatchObject({ kind: "create", name: "courier.mocks.mts" });
  });

  it("refuses a dangling symbolic link at courier.mocks.ts rather than creating a file", () => {
    writeFileSync(join(root, "courier.config.ts"), "export default {};\n");
    symlinkSync(join(root, "gone.ts"), join(root, "courier.mocks.ts"));

    const error = thrownBy(() => inspectMocksTarget(root));

    expect(error).toMatchObject({
      code: "MOCKS_IS_LINK",
      message:
        "courier.mocks.ts is a symbolic link. It points to a file that does not exist, so Studio edits only a regular file.",
    });
  });

  it("refuses a symbolic link at courier.mocks.mjs", () => {
    writeFileSync(join(root, "courier.config.ts"), "export default {};\n");
    writeFileSync(join(outside, "mocks.mjs"), MOCKS);
    symlinkSync(join(outside, "mocks.mjs"), join(root, "courier.mocks.mjs"));

    const error = thrownBy(() => inspectMocksTarget(root));

    expect(error).toMatchObject({
      code: "MOCKS_IS_LINK",
      message:
        "courier.mocks.mjs is a symbolic link. Studio saves an edit by replacing the file, which would replace the link with a copy, so Studio edits only a regular file.",
    });
  });

  it("resolves a project root reached through a link, keeping paths in the resolved root", () => {
    writeFileSync(join(root, "courier.config.ts"), "export default {};\n");
    writeFileSync(join(root, "courier.mocks.ts"), MOCKS);
    const linkedRoot = join(outside, "project");
    symlinkSync(root, linkedRoot);

    expect(inspectMocksTarget(linkedRoot)).toMatchObject({
      kind: "existing",
      path: join(root, "courier.mocks.ts"),
      relative: "courier.mocks.ts",
    });
  });
});
