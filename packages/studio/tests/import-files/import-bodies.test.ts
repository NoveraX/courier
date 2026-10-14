/**
 * The files of an import's folder are read from inside the project only: a
 * subfolder swapped for a link to elsewhere after the walk listed it, and
 * before its file is opened, has nothing read from it — the open follows a
 * link on the way, so the file opened is checked once it is open.
 */
import type * as Fs from "node:fs";
import {
  mkdirSync,
  mkdtempSync,
  openSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ProjectRoot, projectRootAt } from "@noverax/courier-cli/devkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDiskFile } from "../../src/server/import-files/disk-file";
import { importBodies } from "../../src/server/import-files/import-bodies";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return { ...actual, openSync: vi.fn(actual.openSync) };
});

const DIR = "src/api/pets";

let base: string;
let root: ProjectRoot;

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "courier-import-bodies-")));
  mkdirSync(join(base, "project", DIR, "groups"), { recursive: true });
  mkdirSync(join(base, "outside"));
  root = projectRootAt(join(base, "project"));
  writeFileSync(join(root.path, DIR, "index.ts"), "export const index = 1;\n");
  writeFileSync(join(root.path, DIR, "groups", "pets.ts"), "export const pets = 1;\n");
  writeFileSync(join(base, "outside", "pets.ts"), "export const secret = 1;\n");
});

afterEach(() => {
  vi.mocked(openSync).mockReset();
  rmSync(base, { recursive: true, force: true });
});

/* The next open of a file in `groups` first finds `groups` a link to the folder outside. */
async function swapGroupsBeforeItsOpen(): Promise<void> {
  const actual = await vi.importActual<typeof Fs>("node:fs");
  vi.mocked(openSync).mockImplementation((...args: Parameters<typeof actual.openSync>) => {
    const [path] = args;
    if (String(path).endsWith(join("groups", "pets.ts"))) {
      vi.mocked(openSync).mockImplementation(actual.openSync);
      renameSync(join(root.path, DIR, "groups"), join(root.path, DIR, "groups-real"));
      symlinkSync(join(base, "outside"), join(root.path, DIR, "groups"));
    }
    return actual.openSync(...args);
  });
}

describe("importBodies", () => {
  it("reads every file of the folder, by its path in the project", () => {
    expect(importBodies(root, DIR)).toEqual({
      [`${DIR}/index.ts`]: "export const index = 1;\n",
      [`${DIR}/groups/pets.ts`]: "export const pets = 1;\n",
    });
  });

  it.skipIf(process.platform === "win32")(
    "reads nothing from a subfolder swapped for a link outside after the walk listed it",
    async () => {
      await swapGroupsBeforeItsOpen();

      expect(importBodies(root, DIR)).toEqual({
        [`${DIR}/index.ts`]: "export const index = 1;\n",
      });
    },
  );
});

describe("readDiskFile", () => {
  it.skipIf(process.platform === "win32")(
    "finds a link where a folder on the way became one while the file opened",
    async () => {
      await swapGroupsBeforeItsOpen();

      expect(readDiskFile(root, join(root.path, DIR, "groups", "pets.ts"))).toEqual({
        kind: "link",
      });
    },
  );

  it.skipIf(process.platform === "win32")(
    "finds a link at the path itself, wherever it leads",
    () => {
      symlinkSync(join(root.path, DIR, "index.ts"), join(root.path, DIR, "alias.ts"));

      expect(readDiskFile(root, join(root.path, DIR, "alias.ts"))).toEqual({ kind: "link" });
    },
  );
});
