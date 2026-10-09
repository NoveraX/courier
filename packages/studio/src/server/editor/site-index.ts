import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { type CodeCall, codeCalls } from "./calls-in-text";
import type { CatalogEndpoint } from "./endpoint-catalog";
import { matchCalls } from "./match-calls";
import { projectCodeFiles } from "./project-files";

/** Where the code calls an endpoint. */
export interface CallSite {
  /** The file, relative to the project's root: `src/traffic/watch.ts` */
  readonly file: string;
  /** The file's absolute path, which an editor opens */
  readonly path: string;
  readonly line: number;
  readonly column: number;
  /** The line as written, trimmed and cut at 160 characters */
  readonly code: string;
}

/** The project's call sites, kept up to date as files change. */
export interface SiteIndex {
  /** Where the code calls an endpoint, file by file, at most `limit` */
  sitesOf(source: string, endpoint: string, limit?: number): Promise<CallSite[]>;
}

interface ReadFile {
  readonly mtimeMs: number;
  readonly size: number;
  readonly text: string;
  readonly calls: readonly CodeCall[];
}

/* Larger files are generated or bundled: no one writes calls in them. */
const LARGEST_FILE = 512 * 1024;
const FILES_FRESH_MS = 5_000;

/**
 * An index of where the project's code calls its endpoints. A file is read
 * and parsed when first asked for and again only once it changes, and the
 * list of files is looked up at most every five seconds, so asking again
 * costs the files that changed.
 *
 * @param root - The project's root
 * @param catalog - The endpoints the running config defines, read on each question
 * @returns The index
 * @example
 * ```ts
 * const sites = createSiteIndex(root, () => endpointCatalog(running.config.sources));
 * await sites.sitesOf("shop", "orders.place");
 * ```
 */
export function createSiteIndex(
  root: string,
  catalog: () => readonly CatalogEndpoint[],
): SiteIndex {
  const read = new Map<string, ReadFile>();
  let files: { at: number; list: Promise<string[]> } | undefined;
  const listed = () => {
    if (!files || Date.now() - files.at > FILES_FRESH_MS)
      files = { at: Date.now(), list: projectCodeFiles(root) };
    return files.list;
  };
  return {
    async sitesOf(source, endpoint, limit = 50) {
      const wanted = catalog().filter((e) => e.source === source && e.endpoint === endpoint);
      if (wanted.length === 0) return [];
      const sites: CallSite[] = [];
      for (const file of await listed()) {
        const current = await fresh(read, root, file);
        if (!current) continue;
        sites.push(...sitesIn(file, join(root, file), current, catalog(), { source, endpoint }));
        if (sites.length >= limit) break;
      }
      return sites.slice(0, limit);
    },
  };
}

async function fresh(
  read: Map<string, ReadFile>,
  root: string,
  file: string,
): Promise<ReadFile | undefined> {
  try {
    const info = await stat(join(root, file));
    if (!info.isFile() || info.size > LARGEST_FILE) return undefined;
    const known = read.get(file);
    if (known && known.mtimeMs === info.mtimeMs && known.size === info.size) return known;
    const text = await readFile(join(root, file), "utf8");
    const next = { mtimeMs: info.mtimeMs, size: info.size, text, calls: codeCalls(file, text) };
    read.set(file, next);
    return next;
  } catch {
    /* Gone, or unreadable, since the list was made: it holds no call now. */
    read.delete(file);
    return undefined;
  }
}

function sitesIn(
  file: string,
  path: string,
  current: ReadFile,
  catalog: readonly CatalogEndpoint[],
  wanted: { source: string; endpoint: string },
): CallSite[] {
  const lines = current.text.split("\n");
  return matchCalls(current.calls, catalog, current.text)
    .filter((call) =>
      call.endpoints.some((e) => e.source === wanted.source && e.endpoint === wanted.endpoint),
    )
    .map((call) => ({
      file,
      path,
      line: call.line,
      column: call.column,
      code: (lines[call.line - 1] ?? "").trim().slice(0, 160),
    }));
}
