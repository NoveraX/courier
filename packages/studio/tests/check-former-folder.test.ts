/**
 * An import whose files are still where Studio 0.3.0 bound it under a name
 * this release gives it no more is refused 409 `IMPORT_RENAMED` before
 * anything is generated, and the refusal says where its files are, where
 * it goes now, and what to do: remove it, then import it again — or, when
 * both folders hold its files, delete one first.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type ProjectRoot, projectRootAt } from "@noverax/courier-cli/devkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveImportLayout } from "../src/apis/layout/import-layout";
import { checkFormerFolder } from "../src/server/check-former-folder";
import { signGeneratedFile } from "../src/server/import-files/generated-header";
import { ImportRenamedError } from "../src/server/import-renamed-error";

const PLACEMENT = { outputDir: "src/api" };

let scratch: string;
let root: ProjectRoot;

beforeEach(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-check-former-")));
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

function refusal(name: string): unknown {
  try {
    checkFormerFolder(root, name, PLACEMENT, resolveImportLayout(PLACEMENT, name), undefined);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("checkFormerFolder", () => {
  it("refuses an import still in the folder 0.3.0 wrote, saying what to do", () => {
    put("src/api/global-this/source.ts", signGeneratedFile("globalThis", "export {};\n"));

    const error = refusal("globalThis");

    expect(error).toBeInstanceOf(ImportRenamedError);
    expect(error).toMatchObject({ code: "IMPORT_RENAMED", httpStatus: 409 });
    expect(error instanceof Error && error.message).toBe(
      'The import "globalThis" has its files in src/api/global-this, where Studio 0.3.0 bound it as globalThis. Studio now binds it as globalThisGroup, in src/api/global-this-group, and does not move an import\'s files. Remove the import, then import it again: the files the removal takes are kept in .courier/backups.',
    );
  });

  it("asks to delete one folder first when both hold the import's files", () => {
    put("src/api/eval/source.ts", signGeneratedFile("eval", "export {};\n"));
    put("src/api/eval-group/source.ts", signGeneratedFile("eval", "export {};\n"));

    const error = refusal("eval");

    expect(error instanceof Error && error.message).toBe(
      'The import "eval" holds files both in src/api/eval, where Studio 0.3.0 bound it as eval, and in src/api/eval-group. Studio now binds it as evalGroup, in src/api/eval-group, and does not move an import\'s files. Delete the folder you do not keep first.',
    );
  });

  it("lets an import with no such folder through", () => {
    put("src/api/eval-group/source.ts", signGeneratedFile("eval", "export {};\n"));
    put("src/api/pets/source.ts", signGeneratedFile("pets", "export {};\n"));

    expect(refusal("eval")).toBeUndefined();
    expect(refusal("pets")).toBeUndefined();
  });
});
