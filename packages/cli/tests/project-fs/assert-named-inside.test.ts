/**
 * A path outside the project by its name is refused before anything on disk
 * is asked about it — by the check itself, and first by every check of the
 * project's folder, so none relies on its caller to have resolved the path.
 */
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertNamedInside } from "../../src/project-fs/assert-named-inside";
import { assertOpenedInside } from "../../src/project-fs/assert-opened-inside";
import { assertRealInside } from "../../src/project-fs/assert-real-inside";
import { assertResolvesInside } from "../../src/project-fs/assert-resolves-inside";
import { PathOutsideProjectError } from "../../src/project-fs/path-outside-project-error";
import { type ProjectRoot, projectRootAt } from "../../src/project-fs/project-root";
import { readFileInside } from "../../src/project-fs/read-file-inside";

const BY_NAME = /it is outside the project/;

let scratch: string;
let root: ProjectRoot;
let outside: string;

beforeEach(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-named-inside-")));
  mkdirSync(join(scratch, "proj/src"), { recursive: true });
  writeFileSync(join(scratch, "proj/src/a.ts"), "a\n");
  mkdirSync(join(scratch, "elsewhere"));
  outside = join(scratch, "elsewhere/secret.ts");
  writeFileSync(outside, "secret\n");
  root = projectRootAt(join(scratch, "proj"));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("assertNamedInside", () => {
  it("passes the project itself and every path inside it by name", () => {
    for (const path of [root.path, join(root.path, "src/a.ts"), join(root.path, "..foo/a.ts")]) {
      expect(() => assertNamedInside(root, path)).not.toThrow();
    }
  });

  it("refuses a path outside — a sibling that shares the project's name as a prefix among them", () => {
    for (const path of [outside, `${root.path}-other/a.ts`, scratch]) {
      expect(() => assertNamedInside(root, path)).toThrow(PathOutsideProjectError);
      expect(() => assertNamedInside(root, path)).toThrow(BY_NAME);
    }
  });
});

describe("every check of the project's folder", () => {
  it("refuses a path outside by its name before it resolves the path", () => {
    expect(() => assertResolvesInside(root, outside)).toThrow(BY_NAME);
    expect(() => assertRealInside(root, outside)).toThrow(BY_NAME);
  });

  it.skipIf(process.platform === "win32")(
    "refuses a link outside by its name, before it asks whether the path is a link",
    () => {
      const link = join(scratch, "elsewhere/link.ts");
      symlinkSync(outside, link);

      expect(() => assertRealInside(root, link)).toThrow(BY_NAME);
    },
  );

  it("refuses a file opened by a path outside by its name before it looks the path up again", () => {
    const fd = openSync(join(root.path, "src/a.ts"), "r");
    try {
      expect(() => assertOpenedInside(root, outside, fd)).toThrow(BY_NAME);
    } finally {
      closeSync(fd);
    }
  });

  it("reads nothing of a file outside by its name", async () => {
    await expect(readFileInside(root, outside)).rejects.toThrow(BY_NAME);
  });
});
