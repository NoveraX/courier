import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureDirectory } from "../../src/project-fs/ensure-directory";
import { PathOutsideProjectError } from "../../src/project-fs/path-outside-project-error";
import { type ProjectRoot, projectRootAt } from "../../src/project-fs/project-root";

const IS_WINDOWS = process.platform === "win32";

let scratch: string;
let root: ProjectRoot;
let outside: string;

beforeEach(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-ensure-dir-")));
  mkdirSync(join(scratch, "proj"));
  outside = join(scratch, "outside");
  mkdirSync(outside);
  root = projectRootAt(join(scratch, "proj"));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("ensureDirectory", () => {
  it("creates the missing directories down to the one asked for", () => {
    ensureDirectory(root, join(root.path, "src/api/pets"));

    expect(lstatSync(join(root.path, "src/api/pets")).isDirectory()).toBe(true);
  });

  it("leaves an existing directory as it is", () => {
    mkdirSync(join(root.path, "src"));
    writeFileSync(join(root.path, "src/keep.ts"), "x\n");

    ensureDirectory(root, join(root.path, "src"));

    expect(readdirSync(join(root.path, "src"))).toEqual(["keep.ts"]);
  });

  it.skipIf(IS_WINDOWS)("creates nothing through a directory link that leads outside", () => {
    symlinkSync(outside, join(root.path, "src"));

    expect(() => ensureDirectory(root, join(root.path, "src/api/pets"))).toThrow(
      PathOutsideProjectError,
    );
    expect(existsSync(join(outside, "api"))).toBe(false);
  });

  it("stops at a file where a directory should be", () => {
    writeFileSync(join(root.path, "src"), "a file\n");

    /* Windows finds no such path under a file, where POSIX finds the file is not a directory. */
    expect(() => ensureDirectory(root, join(root.path, "src/api"))).toThrow(
      expect.objectContaining({ code: IS_WINDOWS ? "ENOENT" : "ENOTDIR" }),
    );
  });
});
