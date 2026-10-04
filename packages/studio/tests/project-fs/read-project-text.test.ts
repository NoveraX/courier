/**
 * Reading a file a request names in the project says what is wrong with the
 * path as the request named it — a folder given as the spec file is named
 * as the request gave it, not by its absolute path on the machine Studio
 * runs on.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { projectRootAt } from "../../src/server/project-fs/project-root";
import { readProjectText } from "../../src/server/project-fs/read-project-text";

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-read-project-text-")));
  mkdirSync(join(root, "specs"));
  writeFileSync(join(root, "specs", "pets.json"), "{}");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

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
});
