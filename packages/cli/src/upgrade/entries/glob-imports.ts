import { posix } from "node:path";

import { globHead, globTest } from "./glob-match";
import type { GlobLoad } from "./meta-loads";
import { queryLoads } from "./vite-queries";

/** What matching a glob reads of the workspace: its files of code, and how its packages and aliases name folders. */
export interface GlobIn {
  /** The workspace's files of code, relative to its root, sorted. */
  readonly sorted: readonly string[];
  /** The folder of the package a file is in, relative to the root: `""` for the root's. */
  readonly packageOf: (path: string) => string;
  /** The paths an alias — or a `/`, from each folder Vite may take for the root — names from a file, as the resolver reads it. */
  readonly aliased: (from: string, specifier: string) => readonly string[];
  /** The path a path through links leads to. */
  readonly throughLinks: (path: string) => string;
}

/** The files a glob loads: those its patterns name, and those it may, where an alias in one names no folder the upgrade resolves. */
export interface GlobFiles {
  readonly files: readonly string[];
  readonly loose: readonly string[];
}

/* What an alias starts with, as the resolver reads one nothing resolves. */
const ALIAS_PREFIX = /^(?:@@?|~~?|#|\$)\/?/;

function join(dir: string, path: string): string {
  const joined = posix.normalize(dir === "" ? path : `${dir}/${path}`);
  return joined === "." ? "" : joined.replace(/\/$/, "");
}

/* Every file under a folder, from a sorted list: found by halves, read in order. */
function under(sorted: readonly string[], folder: string): readonly string[] {
  if (folder === "") return sorted;
  const prefix = `${folder}/`;
  let [low, high] = [0, sorted.length];
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((sorted[middle] ?? "") < prefix) low = middle + 1;
    else high = middle;
  }
  let end = low;
  while (end < sorted.length && (sorted[end] ?? "").startsWith(prefix)) end++;
  return sorted.slice(low, end);
}

/* Where a pattern's folder is: from the file's, or the `base` it names, from each folder Vite may take for the root, or by an alias; an alias nothing resolves reads the rest of the pattern at any depth of the package, as files it may load. */
function placeOf(input: GlobIn, from: string, glob: GlobLoad, folder: string, rest: string) {
  const dir = input.packageOf(from);
  const relative = /^\.\.?(?:\/|$)/;
  const { base } = glob;
  const bases = base?.startsWith("/")
    ? input.aliased(from, base)
    : [join(posix.dirname(from), base ?? "")];
  if (folder === "") return { folders: [dir], rest, loose: false };
  if (relative.test(folder))
    return { folders: bases.map((each) => join(each, folder)), rest, loose: false };
  const folders = input.aliased(from, folder).map((each) => join(each, ""));
  if (folders.length > 0) return { folders, rest, loose: false };
  const tail = folder.replace(ALIAS_PREFIX, "");
  return { folders: [dir], rest: tail === "" ? `**/${rest}` : `**/${tail}/${rest}`, loose: true };
}

/**
 * The files of code an `import.meta.glob` loads, as Vite matches its
 * patterns: each from the file's folder, or the `base` it names; from
 * each folder Vite may take for the package's root, an HTML page's it
 * builds from and the package's own; or from an alias's folder — those
 * a `!` pattern names left out. Where a pattern holds syntax the upgrade
 * does not read, or the matching is past its limit, every file under the
 * pattern's folder is one it loads, so more are read, never fewer. A
 * glob whose query gives the files' text loads none of them, and one
 * that gives their address may load each.
 *
 * @param input - The workspace's files and folders
 * @param from - The file the glob is in, relative to the root
 * @param glob - The glob
 * @param budget - How many more paths the workspace's globs test, one at a time
 * @returns The files it loads, and those it may
 * @example
 * ```ts
 * globFiles(input, "src/main.tsx", { patterns: ["./pages/*.tsx"], base: undefined, anyCase: false }, budget).files;
 * // ["src/pages/About.tsx", "src/pages/Home.tsx"]
 * ```
 */
export function globFiles(
  input: GlobIn,
  from: string,
  glob: GlobLoad,
  budget: { left: number },
): GlobFiles {
  const loads = queryLoads(glob.query);
  if (loads === "text") return { files: [], loose: [] };
  const [files, loose, out] = [new Set<string>(), new Set<string>(), new Set<string>()];
  for (const written of glob.patterns) {
    const negated = written.startsWith("!");
    const head = globHead(negated ? written.slice(1) : written);
    const place = placeOf(input, from, glob, head.folder, head.rest);
    const test = globTest(place.rest, glob.anyCase);
    for (const folder of place.folders) {
      const real = input.throughLinks(folder);
      for (const path of under(input.sorted, real)) {
        budget.left--;
        const tested = test !== undefined && budget.left >= 0;
        const fits = !tested || test(real === "" ? path : path.slice(real.length + 1));
        if (negated && tested && fits) out.add(path);
        else if (!negated && fits) (place.loose ? loose : files).add(path);
      }
    }
  }
  const kept = (paths: Set<string>) => [...paths].filter((path) => !out.has(path));
  if (loads === "address") return { files: [], loose: [...kept(files), ...kept(loose)] };
  return { files: kept(files), loose: kept(loose) };
}
