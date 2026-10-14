/**
 * A file of the project read as the project's code reaches it: through a
 * link while it stays in the project, never through one that leads out.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PathOutsideProjectError } from "../../src/project-fs/path-outside-project-error";
import { type ProjectRoot, projectRootAt } from "../../src/project-fs/project-root";
import { readFileInside } from "../../src/project-fs/read-file-inside";
import { NotRegularFileError } from "../../src/util/not-regular-file-error";

let base: string;
let root: ProjectRoot;

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "courier-read-inside-")));
  mkdirSync(join(base, "project", "src"), { recursive: true });
  mkdirSync(join(base, "outside"));
  root = projectRootAt(join(base, "project"));
  writeFileSync(join(root.path, "src", "app.ts"), "app");
  writeFileSync(join(base, "outside", "secret.ts"), "secret");
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

async function text(path: string): Promise<string | undefined> {
  return (await readFileInside(root, join(root.path, path)))?.bytes.toString("utf8");
}

describe("readFileInside", () => {
  it("reads a file of the project, and nothing where there is none", async () => {
    expect(await text("src/app.ts")).toBe("app");
    expect(await readFileInside(root, join(root.path, "src", "gone.ts"))).toBeNull();
  });

  it("refuses a folder", async () => {
    await expect(readFileInside(root, join(root.path, "src"))).rejects.toBeInstanceOf(
      NotRegularFileError,
    );
  });

  describe.skipIf(process.platform === "win32")("through a link", () => {
    it("reads the file a link that stays in the project leads to", async () => {
      symlinkSync(join(root.path, "src", "app.ts"), join(root.path, "src", "alias.ts"));
      symlinkSync(join(root.path, "src"), join(root.path, "lib"));

      expect(await text("src/alias.ts")).toBe("app");
      expect(await text("lib/app.ts")).toBe("app");
    });

    it("refuses a link that leads out of the project, at the file or on the way", async () => {
      symlinkSync(join(base, "outside", "secret.ts"), join(root.path, "src", "leak.ts"));
      symlinkSync(join(base, "outside"), join(root.path, "out"));

      await expect(text("src/leak.ts")).rejects.toBeInstanceOf(PathOutsideProjectError);
      await expect(text("out/secret.ts")).rejects.toThrow(
        'Courier refused "out/secret.ts": a symbolic link on the way leads outside the project.',
      );
    });
  });
});
