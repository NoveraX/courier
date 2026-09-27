import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertRealInside } from "../../src/server/project-fs/assert-real-inside";
import { PathOutsideProjectError } from "../../src/server/project-fs/path-outside-project-error";
import { type ProjectRoot, projectRootAt } from "../../src/server/project-fs/project-root";

const IS_WINDOWS = process.platform === "win32";

let scratch: string;
let root: ProjectRoot;
let outside: string;

beforeEach(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-real-inside-")));
  mkdirSync(join(scratch, "proj/src"), { recursive: true });
  outside = join(scratch, "outside");
  mkdirSync(outside);
  writeFileSync(join(outside, "keep.ts"), "keep\n");
  root = projectRootAt(join(scratch, "proj"));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe.skipIf(IS_WINDOWS)("assertRealInside", () => {
  it("accepts a file that does not exist yet under real directories", () => {
    expect(() => assertRealInside(root, join(root.path, "src/api/pets/index.ts"))).not.toThrow();
  });

  it("accepts a directory link that stays inside the project", () => {
    mkdirSync(join(root.path, "src/real"));
    symlinkSync(join(root.path, "src/real"), join(root.path, "src/alias"));

    expect(() => assertRealInside(root, join(root.path, "src/alias/a.ts"))).not.toThrow();
  });

  it("refuses a path under a directory link that leads outside", () => {
    symlinkSync(outside, join(root.path, "src/api"));

    const act = () => assertRealInside(root, join(root.path, "src/api/pets/index.ts"));

    expect(act).toThrow(PathOutsideProjectError);
    expect(act).toThrow(/src\/api\/pets\/index\.ts/);
  });

  it("refuses a file that is itself a link, even one that leads inside", () => {
    writeFileSync(join(root.path, "src/real.ts"), "x\n");
    symlinkSync(join(root.path, "src/real.ts"), join(root.path, "src/alias.ts"));

    expect(() => assertRealInside(root, join(root.path, "src/alias.ts"))).toThrow(
      /it is a symbolic link/,
    );
  });

  it("refuses a dangling link at the file's name", () => {
    symlinkSync(join(outside, "created.ts"), join(root.path, "src/dangling.ts"));

    expect(() => assertRealInside(root, join(root.path, "src/dangling.ts"))).toThrow(
      PathOutsideProjectError,
    );
  });

  it("accepts a project reached through a link to it", () => {
    symlinkSync(root.path, join(scratch, "proj-link"));
    const linked = projectRootAt(join(scratch, "proj-link"));

    expect(() => assertRealInside(linked, join(linked.path, "src/a.ts"))).not.toThrow();
  });
});
