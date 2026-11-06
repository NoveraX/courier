/**
 * The docs folder the package ships: every page of the site's navigation
 * written as MDX, byte for byte as the site serves it at its address with
 * `.md` after it; an index that links every page; a manifest that reads
 * back and names every heading on its line. Writing it twice writes the
 * same bytes, a page gone from the site is gone from the folder, and the
 * folder stays within its size.
 */
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { docPages } from "../../../docs/src/site/content/docs-files";
import { pageMarkdown } from "../../../docs/src/site/content/page-markdown";
import { bundleDocs } from "../scripts/bundle-docs";
import { type DocsManifest, INDEX_FILE, MANIFEST_FILE, manifestOf } from "../src/manifest";

const CONTENT = join(import.meta.dirname, "../../../docs/src/content/docs");
/* What the folder may weigh, compressed file by file: more than the tarball npm publishes. */
const BUDGET_GZIP_BYTES = 600 * 1024;

let work: string;
let out: string;
let manifest: DocsManifest;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "courier-docs-bundle-"));
  out = join(work, "docs");
  manifest = bundleDocs({ contentDir: CONTENT, outDir: out, version: "0.0.0-test" });
});

afterAll(() => rmSync(work, { recursive: true, force: true }));

function filesIn(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

function digest(dir: string): string {
  const hash = createHash("sha256");
  for (const file of filesIn(dir)) hash.update(file).update(readFileSync(join(dir, file)));
  return hash.digest("hex");
}

describe("each page", () => {
  it("is the Markdown the site serves for it, byte for byte", () => {
    const pages = docPages(CONTENT);
    for (const page of pages) {
      const id = page.slug.join("/");
      expect(readFileSync(join(out, `${id}.md`), "utf8"), id).toBe(
        pageMarkdown(page.source, page.title, page.description),
      );
    }
    expect(manifest.pages).toHaveLength(pages.length);
    expect(filesIn(out)).toHaveLength(pages.length + 2);
  });

  it("names each of its headings on the line the manifest says", () => {
    for (const page of manifest.pages) {
      const lines = readFileSync(join(out, page.file), "utf8").split("\n");
      for (const heading of page.headings) {
        const line = lines[heading.line] ?? "";
        expect(line.startsWith(`${"#".repeat(heading.depth)} `), `${page.id}:${heading.line}`).toBe(
          true,
        );
      }
    }
  });
});

describe("the index", () => {
  it("links every page once, each to its file in the folder", () => {
    const index = readFileSync(join(out, INDEX_FILE), "utf8");
    const links = [...index.matchAll(/\]\(([^)]+\.md)\)/g)].map((match) => match[1]);
    expect(links).toEqual(manifest.pages.map((page) => page.file));
    expect(index).toContain("Courier 0.0.0-test");
  });
});

describe("the manifest", () => {
  it("reads back as the one written, every page with its section and address", () => {
    const read = manifestOf(JSON.parse(readFileSync(join(out, MANIFEST_FILE), "utf8")));
    expect(read).toEqual(manifest);
    expect(read?.pages.every((page) => page.section !== "" && page.title !== "")).toBe(true);
  });

  it("is read as nothing once it names a page outside the folder, or one twice", () => {
    const [first] = manifest.pages;
    const outside = { ...first, id: "../secrets", file: "../secrets.md" };
    expect(manifestOf({ ...manifest, pages: [outside] })).toBeNull();
    expect(manifestOf({ ...manifest, pages: [{ ...first, file: "other.md" }] })).toBeNull();
    expect(manifestOf({ ...manifest, pages: [first, first] })).toBeNull();
    expect(manifestOf("a manifest")).toBeNull();
  });
});

describe("the folder", () => {
  it("is written the same, byte for byte, from the same pages", () => {
    const again = join(work, "again");
    bundleDocs({ contentDir: CONTENT, outDir: again, version: "0.0.0-test" });
    expect(digest(again)).toBe(digest(out));
  });

  it("loses a page the site no longer has, and refuses one its navigation does not list", () => {
    const content = join(work, "content");
    cpSync(CONTENT, content, { recursive: true });
    const folder = join(work, "shrinking");
    bundleDocs({ contentDir: content, outDir: folder, version: "0.0.0-test" });
    rmSync(join(content, "quick-start.mdx"));
    bundleDocs({ contentDir: content, outDir: folder, version: "0.0.0-test" });
    expect(filesIn(folder)).not.toContain("quick-start.md");

    writeFileSync(
      join(content, "unlisted.mdx"),
      'export const metadata = { title: "U", description: "" }\n',
    );
    expect(() =>
      bundleDocs({ contentDir: content, outDir: folder, version: "0.0.0-test" }),
    ).toThrow("Pages no section of the navigation lists: /docs/unlisted");
    expect(filesIn(folder)).not.toContain("unlisted.md");
  });

  it("stays within its size, compressed", () => {
    const bytes = filesIn(out).reduce(
      (total, file) => total + gzipSync(readFileSync(join(out, file))).length,
      0,
    );
    expect(bytes).toBeLessThan(BUDGET_GZIP_BYTES);
  });
});
