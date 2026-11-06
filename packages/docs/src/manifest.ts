/** The file in the docs folder that lists every page. */
export const MANIFEST_FILE = "manifest.json";
/** The file in the docs folder an agent starts reading at: every page by section. */
export const INDEX_FILE = "index.md";

/** A heading of a page: its level, its words, its anchor on the site, and the line it is on. */
export interface ManifestHeading {
  /** 2 for `##`, 3 for `###`, and so on. */
  readonly depth: number;
  readonly text: string;
  /** The id of its anchor on the site, which `#` after the page's address names. */
  readonly anchor: string;
  /** The line of the page's file the heading is on, counted from 0. */
  readonly line: number;
}

/** A page of the docs: what it is, where its file is, and where the site serves it. */
export interface ManifestPage {
  /** Its address under `/docs`: `core-concepts/caller`. */
  readonly id: string;
  /** Its file in the docs folder: its id, with `.md` after it. */
  readonly file: string;
  readonly title: string;
  readonly description: string;
  /** The section of the docs' navigation it is in. */
  readonly section: string;
  /** Where the site serves it. */
  readonly url: string;
  readonly headings: readonly ManifestHeading[];
}

/** What the docs folder holds: the version of Courier it documents, and every page in the navigation's order. */
export interface DocsManifest {
  readonly version: string;
  /** Where the site is: the start of every page's address. */
  readonly site: string;
  readonly pages: readonly ManifestPage[];
}

/* A page's id: path segments of lowercase letters, digits and hyphens, so a file named after it stays in the folder. */
const PAGE_ID = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;
const ANCHOR = /^[^\s#]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function headingOf(value: unknown): ManifestHeading | null {
  if (!isRecord(value)) return null;
  const { depth, text, anchor, line } = value;
  if (typeof depth !== "number" || !Number.isInteger(depth) || depth < 2 || depth > 6) return null;
  if (typeof text !== "string" || typeof anchor !== "string" || !ANCHOR.test(anchor)) return null;
  if (typeof line !== "number" || !Number.isInteger(line) || line < 0) return null;
  return { depth, text, anchor, line };
}

/* Every item read by `read`, or nothing once one of them is not what it should be. */
function allOf<T>(values: readonly unknown[], read: (value: unknown) => T | null): T[] | null {
  const items: T[] = [];
  for (const value of values) {
    const item = read(value);
    if (item === null) return null;
    items.push(item);
  }
  return items;
}

function pageOf(value: unknown, site: string): ManifestPage | null {
  if (!isRecord(value)) return null;
  const { id, file, title, description, section, url, headings } = value;
  if (typeof id !== "string" || !PAGE_ID.test(id) || file !== `${id}.md`) return null;
  if (typeof title !== "string" || typeof description !== "string") return null;
  if (typeof section !== "string" || url !== `${site}/docs/${id}`) return null;
  const read = Array.isArray(headings) ? allOf(headings, headingOf) : null;
  return read === null ? null : { id, file, title, description, section, url, headings: read };
}

/**
 * The docs folder's manifest, from what its file parsed to: every page
 * with an id that names a file inside the folder, its file named after
 * it, and its address on the site — or nothing, when the file holds
 * anything else, so that a damaged folder is read as one.
 *
 * @param value - What `manifest.json` parsed to
 * @returns The manifest, or `null` when the value is not one
 * @example
 * ```ts
 * manifestOf(JSON.parse(readFileSync(join(dir, MANIFEST_FILE), "utf8")))?.version; // "0.4.0"
 * ```
 */
export function manifestOf(value: unknown): DocsManifest | null {
  if (!isRecord(value)) return null;
  const { version, site, pages } = value;
  if (typeof version !== "string" || version === "" || typeof site !== "string") return null;
  if (!/^https:\/\/[^/\s]+$/.test(site) || !Array.isArray(pages)) return null;
  const listed = allOf(pages, (page) => pageOf(page, site));
  if (listed === null || new Set(listed.map((page) => page.id)).size !== listed.length) return null;
  return { version, site, pages: listed };
}
