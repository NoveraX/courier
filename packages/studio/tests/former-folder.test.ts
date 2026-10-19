/**
 * The folder Studio 0.3.0 wrote an import into, when this release binds the
 * import otherwise, is found only while it holds the import's files: one
 * Studio recorded writing for it, or one whose header claims it for it. A
 * record alone, of files no longer there, finds nothing, nor does a file of
 * another import or of nobody.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type ProjectRoot, projectRootAt } from "@noverax/courier-cli/devkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ImportStateEntry } from "../src/apis/imports-state";
import { formerFolder } from "../src/server/former-folder";
import { bodyHash } from "../src/server/import-files/body-hash";
import { signGeneratedFile } from "../src/server/import-files/generated-header";

const BODY = "export const thing = 1;\n";
const FORMER = "src/api/undefined";
const NOW = "src/api/undefined-group";
const PLACEMENT = { outputDir: "src/api" };

let scratch: string;
let root: ProjectRoot;

beforeEach(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-former-folder-")));
  mkdirSync(join(scratch, "proj"));
  root = projectRootAt(join(scratch, "proj"));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function put(path: string, content: string): void {
  mkdirSync(dirname(join(root.path, path)), { recursive: true });
  writeFileSync(join(root.path, path), content);
}

function recording(...paths: string[]): ImportStateEntry {
  return {
    specHash: "0",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    lastSyncedAt: "2026-01-01T00:00:00.000Z",
    dir: FORMER,
    files: Object.fromEntries(paths.map((path) => [path, { sha256: bodyHash(BODY) }])),
  };
}

describe("formerFolder", () => {
  it("finds the folder 0.3.0 wrote by a file Studio recorded writing there", () => {
    put(`${FORMER}/source.ts`, BODY);

    expect(
      formerFolder(root, "undefined", PLACEMENT, NOW, recording(`${FORMER}/source.ts`)),
    ).toEqual({ binding: "undefined", dir: FORMER, inBoth: false });
  });

  it("finds it by a header claiming a file for the import, with no record", () => {
    put(`${FORMER}/source.ts`, signGeneratedFile("undefined", BODY));

    expect(formerFolder(root, "undefined", PLACEMENT, NOW, undefined)?.dir).toBe(FORMER);
  });

  it("says when the folder this release writes holds files of the import too", () => {
    put(`${FORMER}/source.ts`, BODY);
    put(`${NOW}/source.ts`, signGeneratedFile("undefined", BODY));

    expect(
      formerFolder(root, "undefined", PLACEMENT, NOW, recording(`${FORMER}/source.ts`))?.inBoth,
    ).toBe(true);
  });

  it("finds nothing once the folder is gone, whatever the record says", () => {
    expect(
      formerFolder(root, "undefined", PLACEMENT, NOW, recording(`${FORMER}/source.ts`)),
    ).toBeUndefined();
  });

  it("finds nothing in a folder of files another import or nobody wrote", () => {
    put(`${FORMER}/mine.ts`, BODY);
    put(`${FORMER}/theirs.ts`, signGeneratedFile("pets", BODY));

    expect(formerFolder(root, "undefined", PLACEMENT, NOW, undefined)).toBeUndefined();
  });

  it("finds nothing for an import this release binds as 0.3.0 did", () => {
    put("src/api/pets/source.ts", signGeneratedFile("pets", BODY));

    expect(formerFolder(root, "pets", PLACEMENT, "src/api/pets", undefined)).toBeUndefined();
  });
});
