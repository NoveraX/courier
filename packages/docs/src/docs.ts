import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { DOCS_LIMITS } from "./limits";
import { type DocsManifest, MANIFEST_FILE, type ManifestPage, manifestOf } from "./manifest";

/** The docs folder as the server reads it: its manifest, and every page's Markdown. */
export interface Docs {
  readonly manifest: DocsManifest;
  /** Each page by its id. */
  readonly pages: ReadonlyMap<string, DocsPage>;
}

/** A page of the docs, with its Markdown. */
export interface DocsPage extends ManifestPage {
  readonly markdown: string;
}

/** Why the docs folder could not be read: something is missing from it, or more than it should hold. */
export class DocsFolderError extends Error {
  constructor(message: string) {
    super(`${message}: reinstall @noverax/courier-docs`);
    this.name = "DocsFolderError";
  }
}

/* A file of the folder, read only when it is no larger than it may be. */
function readLimited(dir: string, file: string, most: number): string {
  const path = join(dir, file);
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    throw new DocsFolderError(`The docs folder has no ${file}`);
  }
  if (size > most) throw new DocsFolderError(`${file} in the docs folder is larger than it may be`);
  return readFileSync(path, "utf8");
}

/**
 * Read the docs folder: its manifest, checked, then every page it lists,
 * each with no more lines than its headings say it has. What the folder
 * holds is read up to its limits and no further.
 *
 * @param dir - The folder
 * @returns The docs
 * @throws {DocsFolderError} When the folder lacks a file, holds more than it may, or its manifest is not one
 * @example
 * ```ts
 * loadDocs(new URL("../docs", import.meta.url).pathname).manifest.version; // "0.4.0"
 * ```
 */
export function loadDocs(dir: string): Docs {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readLimited(dir, MANIFEST_FILE, DOCS_LIMITS.manifestBytes));
  } catch (error) {
    if (error instanceof DocsFolderError) throw error;
    throw new DocsFolderError(`${MANIFEST_FILE} in the docs folder is not JSON`);
  }
  const manifest = manifestOf(parsed);
  if (manifest === null) {
    throw new DocsFolderError(`${MANIFEST_FILE} in the docs folder is not a manifest of the docs`);
  }
  const pages = new Map<string, DocsPage>();
  let total = 0;
  for (const page of manifest.pages) {
    const markdown = readLimited(dir, page.file, DOCS_LIMITS.pageBytes);
    total += markdown.length;
    if (total > DOCS_LIMITS.folderBytes) {
      throw new DocsFolderError("The docs folder holds more than it may");
    }
    const lines = markdown.split("\n").length;
    if (page.headings.some((heading) => heading.line >= lines)) {
      throw new DocsFolderError(
        `${page.file} in the docs folder is not the page its manifest lists`,
      );
    }
    pages.set(page.id, { ...page, markdown });
  }
  return { manifest, pages };
}
