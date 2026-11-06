/**
 * The docs folder as the server reads it: every page its manifest lists,
 * read up to its limits and no further. A folder that lacks a file, holds
 * more than it may, or whose manifest is not one is read as damaged, with
 * what to do about it.
 */
import { cpSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DocsFolderError, loadDocs } from "../src/docs";
import { DOCS_LIMITS } from "../src/limits";
import { MANIFEST_FILE } from "../src/manifest";
import { type Bundled, bundled } from "./support/bundled";

let docs: Bundled;
let work: string;

beforeAll(() => {
  docs = bundled();
  work = mkdtempSync(join(tmpdir(), "courier-docs-damaged-"));
});

afterAll(() => {
  docs.remove();
  rmSync(work, { recursive: true, force: true });
});

/* A copy of the folder, damaged as a test says. */
function damaged(damage: (dir: string) => void): string {
  const dir = mkdtempSync(join(work, "copy-"));
  cpSync(docs.dir, dir, { recursive: true });
  damage(dir);
  return dir;
}

describe("the docs folder", () => {
  it("is read whole: every page its manifest lists, with its Markdown", () => {
    const read = loadDocs(docs.dir);
    expect(read.manifest.version).toBe("0.0.0-test");
    expect(read.pages.size).toBe(read.manifest.pages.length);
    expect(
      [...read.pages.values()].every((page) => page.markdown.startsWith(`# ${page.title}\n`)),
    ).toBe(true);
  });

  it.each([
    [
      "has no manifest",
      (dir: string) => rmSync(join(dir, MANIFEST_FILE)),
      "The docs folder has no manifest.json",
    ],
    [
      "has a manifest that is not JSON",
      (dir: string) => writeFileSync(join(dir, MANIFEST_FILE), "{"),
      "manifest.json in the docs folder is not JSON",
    ],
    [
      "names a page outside it",
      (dir: string) =>
        writeFileSync(
          join(dir, MANIFEST_FILE),
          JSON.stringify({
            version: "1",
            site: "https://x.test",
            pages: [{ id: "../etc/passwd" }],
          }),
        ),
      "manifest.json in the docs folder is not a manifest of the docs",
    ],
    [
      "lacks a page",
      (dir: string) => rmSync(join(dir, "quick-start.md")),
      "The docs folder has no quick-start.md",
    ],
    [
      "holds a page larger than one may be",
      (dir: string) =>
        writeFileSync(join(dir, "quick-start.md"), "x".repeat(DOCS_LIMITS.pageBytes + 1)),
      "quick-start.md in the docs folder is larger than it may be",
    ],
    [
      "holds a page with fewer lines than its headings",
      (dir: string) => truncateSync(join(dir, "advanced/abort.md"), 40),
      "advanced/abort.md in the docs folder is not the page its manifest lists",
    ],
  ])("is read as damaged when it %s, with what to do about it", (_, damage, message) => {
    const dir = damaged(damage);
    expect(() => loadDocs(dir)).toThrow(DocsFolderError);
    expect(() => loadDocs(dir)).toThrow(`${message}: reinstall @noverax/courier-docs`);
  });
});
