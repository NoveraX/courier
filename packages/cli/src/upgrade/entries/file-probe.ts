import { posix } from "node:path";

/** What finding a file reads of the workspace: its files of code, its links, and what the graph could not read. */
export interface ProbeIn {
  /** Its files of code, relative to its root. */
  readonly paths: ReadonlySet<string>;
  /** Each link to a file or folder of code: the link, and the path it leads to. */
  readonly links: ReadonlyMap<string, string>;
  /** The file or folder the graph could not read that a path is, or is in. */
  readonly unreadAt: (path: string) => number | undefined;
}

const EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".svelte",
  ".astro",
];
/* What TypeScript's ESM imports write for a file of TypeScript's: `./api.js` for `api.ts`. */
const WRITTEN_FOR: Readonly<Record<string, readonly string[]>> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};
/* How many links a path is followed through, as a system follows a link's links before it gives up. */
const LINK_HOPS = 40;

/**
 * The path a path through links leads to: each link it starts with, the
 * longest first, read as what it links to.
 *
 * @param links - Each link to a file or folder of code, and the path it leads to
 * @param path - The path, relative to the workspace's root
 * @returns The path it leads to
 * @example
 * ```ts
 * throughLinks(new Map([["src/shared", "packages/shared/src"]]), "src/shared/api.ts"); // "packages/shared/src/api.ts"
 * ```
 */
export function throughLinks(links: ReadonlyMap<string, string>, path: string): string {
  let at = path;
  for (let hop = 0; links.size > 0 && hop < LINK_HOPS; hop++) {
    let end = at.length;
    while (end > 0 && !links.has(at.slice(0, end))) end = at.lastIndexOf("/", end - 1);
    if (end <= 0) return at;
    const target = links.get(at.slice(0, end)) ?? "";
    const rest = at.slice(end + 1);
    at = target === "" || rest === "" ? target || rest : `${target}/${rest}`;
  }
  return at;
}

/* The files a path without its extension may name, as a bundler looks for them: a file of TypeScript's for a `.js` one, the file, or a folder's index — through any link on the way. */
function candidatesOf(input: ProbeIn, base: string): string[] {
  const extension = posix.extname(base);
  const written = (WRITTEN_FOR[extension] ?? []).map(
    (to) => `${base.slice(0, -extension.length)}${to}`,
  );
  return [
    ...written,
    base,
    ...EXTENSIONS.map((each) => `${base}${each}`),
    ...EXTENSIONS.map((each) => `${base}/index${each}`),
  ].map((candidate) => throughLinks(input.links, candidate));
}

/**
 * The file a path without its extension names, as a bundler finds it: a
 * file of TypeScript's for a `.js` one, the file, a file of each
 * extension of code, or a folder's index — through any link on the way.
 *
 * @param input - The workspace's files and links
 * @param base - The path, relative to the workspace's root
 * @returns The file, one the walk read; none where there is none
 * @example
 * ```ts
 * probe(input, "src/lib/api.js"); // "src/lib/api.ts"
 * ```
 */
export function probe(input: ProbeIn, base: string): string | undefined {
  return candidatesOf(input, base).find((candidate) => input.paths.has(candidate));
}

/**
 * The file or folder the graph could not read that a path without its
 * extension may name, as {@link probe} looks for it.
 *
 * @param input - The workspace's files, links and what the graph could not read
 * @param base - The path, relative to the workspace's root
 * @returns Its index among what the graph could not read; none where it names none
 * @example
 * ```ts
 * probeUnread(input, "lib/schema"); // 0, where lib/schema.ts is too large to read
 * ```
 */
export function probeUnread(input: ProbeIn, base: string): number | undefined {
  for (const candidate of candidatesOf(input, base)) {
    const unread = input.unreadAt(candidate);
    if (unread !== undefined) return unread;
  }
  return undefined;
}
