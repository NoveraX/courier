/**
 * Write the docs folder this package ships: every page of the site's
 * navigation as the site serves it at its address with `.md` after it —
 * the same function makes both, from the same MDX — an index of them by
 * section, and a manifest of their headings and anchors.
 *
 * Usage: tsx scripts/bundle-docs.ts
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { docPages } from "../../../docs/src/site/content/docs-files";
import { docsNav } from "../../../docs/src/site/content/docs-nav";
import { pageHeadings } from "../../../docs/src/site/content/page-headings";
import { pageMarkdown } from "../../../docs/src/site/content/page-markdown";
import { SITE_URL } from "../../../docs/src/site/site-url";
import {
  type DocsManifest,
  INDEX_FILE,
  MANIFEST_FILE,
  type ManifestHeading,
  type ManifestPage,
} from "../src/manifest";

const PACKAGE = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Where the docs are read from and written to, and the version they document. */
export interface BundleOptions {
  /** The site's MDX pages. */
  readonly contentDir: string;
  /** The folder to write: replaced whole. */
  readonly outDir: string;
  readonly version: string;
}

const MARKDOWN_HEADING = /^(#{2,6})\s/;
const FENCE = /^\s*```/;

/* The lines of the page's Markdown its headings are on, outside its code blocks. */
function headingLines(markdown: string): number[] {
  const lines: number[] = [];
  let fenced = false;
  markdown.split("\n").forEach((line, at) => {
    if (FENCE.test(line)) fenced = !fenced;
    else if (!fenced && MARKDOWN_HEADING.test(line)) lines.push(at);
  });
  return lines;
}

/* Each heading of the page, with its anchor as the site renders the MDX, on its line of the Markdown. */
function headingsOf(id: string, source: string, markdown: string): ManifestHeading[] {
  const anchors = pageHeadings(source);
  const lines = headingLines(markdown);
  if (anchors.length !== lines.length) {
    throw new Error(
      `${id}: its Markdown has ${lines.length} headings and its page ${anchors.length}`,
    );
  }
  return anchors.map(({ depth, text, id: anchor }, at) => ({
    depth,
    text,
    anchor,
    line: lines[at] ?? 0,
  }));
}

/* The page an agent starts at: what the folder is, then every page by section. */
function indexOf(manifest: DocsManifest): string {
  const sections = new Map<string, ManifestPage[]>();
  for (const page of manifest.pages) {
    sections.set(page.section, [...(sections.get(page.section) ?? []), page]);
  }
  const lines = [
    "# Courier documentation",
    "",
    `The documentation of Courier ${manifest.version}, as ${manifest.site}/docs serves it: one Markdown file a page, in the folder this file is in. A link in a page to \`/docs/<page>\` names \`<page>.md\` here, and \`#<anchor>\` after it one of its headings; \`${MANIFEST_FILE}\` lists each page's headings with their anchors.`,
    "",
  ];
  for (const [section, pages] of sections) {
    lines.push(`## ${section}`, "");
    for (const page of pages) {
      lines.push(`- [${page.title}](${page.file})${page.description ? `: ${page.description}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Write the docs folder: each page the site's navigation lists that is
 * written as MDX — a live example runs only in a browser — its index and
 * its manifest. The folder is written beside the old one and put in its
 * place whole, so a build that fails leaves the old one, and a page that
 * no longer exists is gone.
 *
 * @param options - Where the MDX is, where the folder goes, and the version
 * @returns The manifest written
 * @throws When a page is in no section of the navigation, or its Markdown and its page disagree on its headings
 * @example
 * ```ts
 * bundleDocs({ contentDir, outDir: join(PACKAGE, "docs"), version: "0.4.0" });
 * ```
 */
export function bundleDocs({ contentDir, outDir, version }: BundleOptions): DocsManifest {
  const pages = new Map(docPages(contentDir).map((page) => [`/docs/${page.slug.join("/")}`, page]));
  const files = new Map<string, string>();
  const listed: ManifestPage[] = [];
  for (const section of docsNav) {
    for (const item of section.items) {
      const page = pages.get(item.href);
      if (page === undefined) continue;
      const id = page.slug.join("/");
      const markdown = pageMarkdown(page.source, page.title, page.description);
      files.set(`${id}.md`, markdown);
      listed.push({
        id,
        file: `${id}.md`,
        title: page.title,
        description: page.description,
        section: section.label,
        url: `${SITE_URL}${item.href}`,
        headings: headingsOf(id, page.source, markdown),
      });
    }
  }
  const unlisted = [...pages.keys()].filter((href) => !files.has(`${href.slice("/docs/".length)}.md`));
  if (unlisted.length > 0) {
    throw new Error(`Pages no section of the navigation lists: ${unlisted.join(", ")}`);
  }
  const manifest: DocsManifest = { version, site: SITE_URL, pages: listed };
  files.set(INDEX_FILE, indexOf(manifest));
  files.set(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);

  const staging = `${outDir}.${process.pid}.tmp`;
  rmSync(staging, { recursive: true, force: true });
  for (const [file, text] of files) {
    const path = join(staging, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  renameSync(staging, outDir);
  return manifest;
}

/* The version this package is released at: the one its docs document. */
function packageVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8"));
  if (typeof manifest === "object" && manifest !== null && "version" in manifest) {
    if (typeof manifest.version === "string") return manifest.version;
  }
  throw new Error("The docs package's manifest names no version");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = packageVersion();
  const manifest = bundleDocs({
    contentDir: join(PACKAGE, "../../docs/src/content/docs"),
    outDir: join(PACKAGE, "docs"),
    version,
  });
  console.log(`Wrote the docs of Courier ${version}: ${manifest.pages.length} pages`);
}
