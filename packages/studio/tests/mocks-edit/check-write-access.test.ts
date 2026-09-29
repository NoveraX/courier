import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkWriteAccess } from "../../src/server/mocks-edit/check-write-access";
import { MocksEditRefusal } from "../../src/server/mocks-edit/mocks-edit-refusal";

/* Root may write anything, so permission bits cannot refuse it. */
const RUNS_AS_ROOT = process.getuid?.() === 0;
const NOTHING_THROWN = Symbol("nothing thrown");

let dir: string;

function thrownBy(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  return NOTHING_THROWN;
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-write-access-")));
});

afterEach(() => {
  chmodSync(dir, 0o755);
  rmSync(dir, { recursive: true, force: true });
});

describe("checkWriteAccess", () => {
  it("passes for a file this process may write", () => {
    const file = join(dir, "courier.mocks.ts");
    writeFileSync(file, "export default {};\n");

    expect(thrownBy(() => checkWriteAccess(file, "courier.mocks.ts", "It is read-only."))).toBe(
      NOTHING_THROWN,
    );
  });

  it.skipIf(RUNS_AS_ROOT)("refuses a read-only file, naming it and the error code", () => {
    const file = join(dir, "courier.mocks.ts");
    writeFileSync(file, "export default {};\n");
    chmodSync(file, 0o444);

    const error = thrownBy(() => checkWriteAccess(file, "courier.mocks.ts", "It is read-only."));

    expect(error).toBeInstanceOf(MocksEditRefusal);
    expect(error).toMatchObject({
      code: "MOCKS_NOT_WRITABLE",
      message: "Studio may not write courier.mocks.ts (EACCES). It is read-only.",
      cause: { code: "EACCES" },
      source: null,
    });
  });

  it.skipIf(RUNS_AS_ROOT)("refuses a directory it may not create files in", () => {
    const project = join(dir, "app");
    mkdirSync(project);
    chmodSync(project, 0o555);

    const error = thrownBy(() =>
      checkWriteAccess(
        project,
        "the project directory",
        "Studio would create courier.mocks.ts there.",
      ),
    );
    chmodSync(project, 0o755);

    expect(error).toMatchObject({
      code: "MOCKS_NOT_WRITABLE",
      message:
        "Studio may not write the project directory (EACCES). Studio would create courier.mocks.ts there.",
    });
  });

  it("refuses a path that does not exist, naming ENOENT", () => {
    const missing = join(dir, "gone");

    const error = thrownBy(() => checkWriteAccess(missing, "gone", "It is missing."));

    expect(error).toMatchObject({
      code: "MOCKS_NOT_WRITABLE",
      message: "Studio may not write gone (ENOENT). It is missing.",
    });
  });
});
