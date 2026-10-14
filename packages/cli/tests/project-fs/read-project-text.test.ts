/**
 * Reading a file a request names in the project says what is wrong with the
 * path as the request named it — a folder given as the spec file is named
 * as the request gave it, not by its absolute path on the machine Studio
 * runs on — and reads nothing outside the project, not even through a
 * folder swapped for a link between the checks and the open.
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { projectRootAt } from "../../src/project-fs/project-root";
import { readProjectText } from "../../src/project-fs/read-project-text";
import { readRegularFile } from "../../src/util/read-regular-file";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return { ...actual, openSync: vi.fn(actual.openSync) };
});

let base: string;
let root: string;

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "courier-read-project-text-")));
  root = join(base, "project");
  mkdirSync(join(root, "specs"), { recursive: true });
  writeFileSync(join(root, "specs", "pets.json"), "{}");
  mkdirSync(join(base, "outside"));
  writeFileSync(join(base, "outside", "pets.json"), "outside");
});

afterEach(() => {
  vi.mocked(openSync).mockReset();
  rmSync(base, { recursive: true, force: true });
});

/* The next open first finds `specs` a link to the folder outside, as a racing process would leave it. */
async function swapBeforeTheOpen(): Promise<void> {
  const actual = await vi.importActual<typeof Fs>("node:fs");
  vi.mocked(openSync).mockImplementationOnce((...args: Parameters<typeof actual.openSync>) => {
    renameSync(join(root, "specs"), join(root, "specs-real"));
    symlinkSync(join(base, "outside"), join(root, "specs"));
    return actual.openSync(...args);
  });
}

describe("readProjectText", () => {
  it("reads a file in the project", () => {
    expect(readProjectText(projectRootAt(root), "specs/pets.json")).toBe("{}");
  });

  it("refuses a folder, naming it as the request did", () => {
    let refusal: unknown;
    try {
      readProjectText(projectRootAt(root), "specs");
    } catch (error) {
      refusal = error;
    }

    expect(refusal).toMatchObject({
      code: "NOT_REGULAR_FILE",
      message: "specs is a directory, not a regular file.",
    });
    expect(String(refusal)).not.toContain(root);
  });

  it.skipIf(process.platform === "win32")(
    "refuses a file a folder swapped for a link outside, after the checks and before the open, would have it read",
    async () => {
      await swapBeforeTheOpen();

      expect(() => readProjectText(projectRootAt(root), "specs/pets.json")).toThrow(
        'Courier refused "specs/pets.json": a symbolic link on the way leads outside the project.',
      );
    },
  );

  it.skipIf(process.platform === "win32")(
    "is refused by its check of the open file: the open alone reads the file outside",
    async () => {
      await swapBeforeTheOpen();

      expect(readRegularFile(join(root, "specs", "pets.json"))?.bytes.toString("utf8")).toBe(
        "outside",
      );
    },
  );
});
