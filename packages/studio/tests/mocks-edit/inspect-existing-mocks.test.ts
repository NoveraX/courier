import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  linkSync,
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

import { inspectExistingMocks } from "../../src/server/mocks-edit/inspect-existing-mocks";
import { MocksEditRefusal } from "../../src/server/mocks-edit/mocks-edit-refusal";

/* Root may write anything, so permission bits cannot refuse it. */
const RUNS_AS_ROOT = process.getuid?.() === 0;
const MOCKS = "export default defineMocks({});\n";
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

function inspect(name = "courier.mocks.ts") {
  return inspectExistingMocks(root, join(root, name), "courier.config.ts");
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-inspect-existing-")));
  writeFileSync(join(root, "courier.config.ts"), "export default { sources: {} };\n");
});

afterEach(() => {
  vi.restoreAllMocks();
  chmodSync(root, 0o755);
  rmSync(root, { recursive: true, force: true });
});

describe("inspectExistingMocks", () => {
  it("reads the file with its hash and mode, keeping a byte-order mark in the text", () => {
    const bytes = Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from(MOCKS)]);
    const path = join(root, "courier.mocks.ts");
    writeFileSync(path, bytes);
    chmodSync(path, 0o664);

    const target = inspect();

    expect(target).toEqual({
      kind: "existing",
      path,
      relative: "courier.mocks.ts",
      name: "courier.mocks.ts",
      bytes,
      text: `\uFEFF${MOCKS}`,
      hash: createHash("sha256").update(bytes).digest("hex"),
      mode: 0o664,
      configName: "courier.config.ts",
    });
  });

  it("refuses a symbolic link to a mocks file", () => {
    writeFileSync(join(root, "shared-mocks.ts"), MOCKS);
    symlinkSync(join(root, "shared-mocks.ts"), join(root, "courier.mocks.ts"));

    const error = thrownBy(() => inspect());

    expect(error).toBeInstanceOf(MocksEditRefusal);
    expect(error).toMatchObject({
      code: "MOCKS_IS_LINK",
      message:
        "courier.mocks.ts is a symbolic link. Studio saves an edit by replacing the file, which would replace the link with a copy, so Studio edits only a regular file.",
    });
  });

  it("refuses a symbolic link whose target does not exist", () => {
    symlinkSync(join(root, "gone.ts"), join(root, "courier.mocks.ts"));

    const error = thrownBy(() => inspect());

    expect(error).toMatchObject({
      code: "MOCKS_IS_LINK",
      message:
        "courier.mocks.ts is a symbolic link. It points to a file that does not exist, so Studio edits only a regular file.",
    });
  });

  it("refuses a directory named courier.mocks.ts as not a regular file", () => {
    mkdirSync(join(root, "courier.mocks.ts"));

    const error = thrownBy(() => inspect());

    expect(error).toMatchObject({
      code: "MOCKS_NOT_REGULAR",
      message: "courier.mocks.ts is a directory, so Studio cannot edit it as a mocks file.",
    });
  });

  it.skipIf(process.platform === "win32")(
    "refuses a FIFO named courier.mocks.ts as not a regular file",
    () => {
      execFileSync("mkfifo", [join(root, "courier.mocks.ts")]);

      const error = thrownBy(() => inspect());

      expect(error).toMatchObject({
        code: "MOCKS_NOT_REGULAR",
        message:
          "courier.mocks.ts is not a regular file, so Studio cannot edit it as a mocks file.",
      });
    },
  );

  it("refuses a file removed after the search found it, as a change to reload", () => {
    const error = thrownBy(() => inspect());

    expect(error).toMatchObject({
      code: "MOCKS_CHANGED_SINCE_LOAD",
      message:
        "courier.mocks.ts was removed while Studio was looking at it. Studio plans the edit once it has reloaded.",
    });
  });

  it("refuses a file with a second hard link", () => {
    writeFileSync(join(root, "courier.mocks.ts"), MOCKS);
    linkSync(join(root, "courier.mocks.ts"), join(root, "backup.ts"));

    const error = thrownBy(() => inspect());

    expect(error).toMatchObject({
      code: "MOCKS_HARD_LINKED",
      message:
        "courier.mocks.ts has 2 hard links. Studio saves an edit by replacing the file, which would part it from its other names, so it leaves the file to you.",
    });
  });

  it("names a temporary file Studio left behind when that is the other hard link", () => {
    writeFileSync(join(root, "courier.mocks.ts"), MOCKS);
    linkSync(join(root, "courier.mocks.ts"), join(root, ".courier.mocks.4242-0a1b2c3d.tmp"));

    const error = thrownBy(() => inspect());

    expect(error).toMatchObject({
      code: "MOCKS_HARD_LINKED",
      message:
        "courier.mocks.ts has 2 hard links. Studio saves an edit by replacing the file, which would part it from its other names, so it leaves the file to you. One of them is .courier.mocks.4242-0a1b2c3d.tmp, most likely left behind when Studio created the file; delete it and ask again.",
    });
  });

  it("does not name a temporary file that is not the other hard link", () => {
    writeFileSync(join(root, "courier.mocks.ts"), MOCKS);
    linkSync(join(root, "courier.mocks.ts"), join(root, "backup.ts"));
    writeFileSync(join(root, ".courier.mocks.4242-0a1b2c3d.tmp"), MOCKS);

    const error = thrownBy(() => inspect());

    expect(error).toMatchObject({
      code: "MOCKS_HARD_LINKED",
      message:
        "courier.mocks.ts has 2 hard links. Studio saves an edit by replacing the file, which would part it from its other names, so it leaves the file to you.",
    });
  });

  it.skipIf(process.platform === "win32")("refuses a file another user owns", () => {
    writeFileSync(join(root, "courier.mocks.ts"), MOCKS);
    const owner = statSync(join(root, "courier.mocks.ts")).uid;
    vi.spyOn(process, "getuid").mockReturnValue(owner + 1);

    const error = thrownBy(() => inspect());

    expect(error).toMatchObject({
      code: "MOCKS_NOT_OWNED",
      message: `courier.mocks.ts belongs to user ${owner}, but Studio runs as user ${owner + 1}. An edited file would belong to user ${owner + 1}, so Studio leaves it to its owner.`,
    });
  });

  it.skipIf(RUNS_AS_ROOT || process.platform === "win32")(
    "refuses a file another user owns when Studio runs as root",
    () => {
      writeFileSync(join(root, "courier.mocks.ts"), MOCKS);
      const owner = statSync(join(root, "courier.mocks.ts")).uid;
      vi.spyOn(process, "getuid").mockReturnValue(0);

      const error = thrownBy(() => inspect());

      expect(error).toMatchObject({
        code: "MOCKS_NOT_OWNED",
        message: `courier.mocks.ts belongs to user ${owner}, but Studio runs as user 0. An edited file would belong to user 0, so Studio leaves it to its owner.`,
      });
    },
  );

  it.skipIf(RUNS_AS_ROOT)("refuses a read-only file", () => {
    writeFileSync(join(root, "courier.mocks.ts"), MOCKS);
    chmodSync(join(root, "courier.mocks.ts"), 0o444);

    const error = thrownBy(() => inspect());

    expect(error).toMatchObject({
      code: "MOCKS_NOT_WRITABLE",
      message:
        "Studio may not write courier.mocks.ts (EACCES). Studio does not edit a file that is read-only to it.",
    });
  });

  it.skipIf(RUNS_AS_ROOT)("refuses when the project directory is read-only", () => {
    writeFileSync(join(root, "courier.mocks.ts"), MOCKS);
    chmodSync(root, 0o555);

    const error = thrownBy(() => inspect());

    expect(error).toMatchObject({
      code: "MOCKS_NOT_WRITABLE",
      message:
        "Studio may not write the project directory (EACCES). Studio saves an edit to courier.mocks.ts by writing a new file there and renaming it over the old one.",
    });
  });

  it("refuses a file larger than 1 MiB", () => {
    writeFileSync(join(root, "courier.mocks.ts"), "a".repeat(1024 * 1024 + 1));

    const error = thrownBy(() => inspect());

    expect(error).toMatchObject({
      code: "MOCKS_TOO_LARGE",
      message:
        "courier.mocks.ts is 1048577 bytes, more than the 1048576 bytes (1 MiB) Studio edits.",
    });
  });

  it("reads a file of exactly 1 MiB", () => {
    writeFileSync(join(root, "courier.mocks.ts"), "a".repeat(1024 * 1024));

    expect(inspect().bytes.length).toBe(1024 * 1024);
  });

  it.each([["courier.mocks.js"], ["courier.mocks.mjs"], ["courier.mocks.cjs"]])(
    "refuses the JavaScript file %s",
    (name) => {
      writeFileSync(join(root, name), MOCKS);

      const error = thrownBy(() => inspect(name));

      expect(error).toMatchObject({
        code: "MOCKS_JAVASCRIPT",
        message: `${name} is JavaScript. Studio writes ES imports named as TypeScript resolves them, which a CommonJS file cannot take and Node does not always resolve, so it edits TypeScript mocks files only.`,
      });
    },
  );

  it.each([["courier.mocks.mts"], ["courier.mocks.cts"]])(
    "reads the TypeScript file %s",
    (name) => {
      writeFileSync(join(root, name), MOCKS);

      expect(inspect(name)).toMatchObject({ kind: "existing", name, relative: name, text: MOCKS });
    },
  );

  it("refuses a file whose header marks it as generated", () => {
    writeFileSync(join(root, "courier.mocks.ts"), `// @generated\n${MOCKS}`);

    expect(thrownBy(() => inspect())).toMatchObject({ code: "MOCKS_GENERATED" });
  });

  it("refuses a file that is not UTF-8", () => {
    writeFileSync(join(root, "courier.mocks.ts"), Buffer.from([0x2f, 0x2f, 0x20, 0xe9, 0x0a]));

    expect(thrownBy(() => inspect())).toMatchObject({ code: "NOT_UTF8" });
  });
});
