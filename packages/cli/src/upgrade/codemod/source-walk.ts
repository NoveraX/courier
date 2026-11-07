import { type Dirent, existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative, sep } from "node:path";

import { isRecord } from "../../util/is-record";
import { UPGRADE_LIMITS } from "../limits";

/** A file or folder of the project's an upgrade did not read, and why. */
export interface Unread {
  readonly path: string;
  readonly why: string;
  /** Whether it is a folder, every file under which is unread. */
  readonly folder: boolean;
}

/** What a walk of a project's folders found. */
export interface WalkedFolders {
  /** The files of code it read, relative to the root, `/`-separated. */
  readonly files: readonly string[];
  /** Each link to a file or folder the walk reads by its own path: the link, and that path, both relative to the root. */
  readonly links: ReadonlyMap<string, string>;
  readonly unread: readonly Unread[];
  /** Whether it stopped at its limit of files. */
  readonly stopped: boolean;
}

/** The extensions of the files of code an upgrade reads. */
export const CODE_EXTENSIONS: ReadonlySet<string> = new Set([
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
]);
/* Folders that hold none of a project's own code wherever they are: installed packages, and version control's. */
const NEVER = new Set(["node_modules", ".git", ".hg", ".svn", ".jj"]);
/* What builds, frameworks and their tools write at a package's root; a folder of the same name below it is the project's. */
const OUTPUT = new Set([
  "dist",
  "build",
  "out",
  "coverage",
  "storybook-static",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".vercel",
  ".netlify",
  ".astro",
  ".react-router",
  ".expo",
  ".wrangler",
  ".turbo",
  ".vinxi",
  ".nitro",
  ".tanstack",
  ".open-next",
  ".docusaurus",
  ".cache",
  ".parcel-cache",
  ".angular",
  ".yarn",
]);

function codeOf(error: unknown): string {
  return isRecord(error) && typeof error.code === "string" ? error.code : "an error";
}

/**
 * The project's folders, walked from the workspace's root within the
 * upgrade's limits: every folder but installed packages, version
 * control's, and what builds write at a package's root — a folder of
 * that name below it, as Next.js's `app/build`, is read. A link is read
 * by the path it leads to, so a file is read once: a link to what the
 * walk reads is kept for imports to follow, and one out of the workspace,
 * or into what the walk does not read, is named. So is a file too large,
 * a folder deeper than the walk goes, and one that would not open.
 *
 * @param root - The workspace's folder
 * @returns What the walk found
 * @example
 * ```ts
 * walkFolders("/work/shop").links; // Map { "apps/web/shared" => "packages/shared/src" }
 * ```
 */
export function walkFolders(root: string): WalkedFolders {
  const real = realpathSync(root);
  const files: string[] = [];
  const links = new Map<string, string>();
  const unread: Unread[] = [];
  let seen = 0;
  let stopped = false;
  const isPackage = (dir: string) => dir === "" || existsSync(join(root, dir, "package.json"));
  /* Whether the walk reads a file or folder by its own path: nothing it leaves out holds it. */
  const reads = (path: string, folder: boolean) => {
    const segments = path === "" ? [] : path.split("/");
    if (segments.length - (folder ? 0 : 1) > UPGRADE_LIMITS.sourceDepth) return false;
    return segments.every(
      (name, at) =>
        !NEVER.has(name) && !(OUTPUT.has(name) && isPackage(segments.slice(0, at).join("/"))),
    );
  };
  const link = (path: string) => {
    let target: string;
    let folder: boolean;
    try {
      target = realpathSync(join(root, path));
      folder = statSync(target).isDirectory();
    } catch {
      return;
    }
    if (!folder && !CODE_EXTENSIONS.has(extname(path))) return;
    const inside = relative(real, target).split(sep).join("/");
    if (inside.startsWith("..") || isAbsolute(inside))
      unread.push({ path, why: "it links out of the workspace", folder });
    else if (!reads(inside, folder))
      unread.push({ path, why: `it links to ${inside}, which an upgrade does not read`, folder });
    else links.set(path, inside);
  };
  const file = (path: string) => {
    if (++seen > UPGRADE_LIMITS.sourceFiles) {
      stopped = true;
      return;
    }
    const { size } = statSync(join(root, path));
    if (size <= UPGRADE_LIMITS.sourceBytes) files.push(path);
    else
      unread.push({
        path,
        why: `it is ${(size / 1024 / 1024).toFixed(1)} MiB, past the ${UPGRADE_LIMITS.sourceBytes / 1024 / 1024} MiB an upgrade reads`,
        folder: false,
      });
  };
  const walk = (dir: string, depth: number) => {
    if (depth > UPGRADE_LIMITS.sourceDepth) {
      const why = `it is deeper than the ${UPGRADE_LIMITS.sourceDepth} folders an upgrade walks`;
      unread.push({ path: dir, why, folder: true });
      return;
    }
    let entries: Dirent[];
    try {
      entries = readdirSync(join(root, dir), { withFileTypes: true });
    } catch (error) {
      if (dir === "") throw error;
      unread.push({ path: dir, why: `it could not be opened (${codeOf(error)})`, folder: true });
      return;
    }
    const atPackage = dir === "" || entries.some((each) => each.name === "package.json");
    for (const entry of entries) {
      if (stopped) return;
      if (NEVER.has(entry.name) || (atPackage && OUTPUT.has(entry.name))) continue;
      const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
      if (entry.isSymbolicLink()) link(path);
      else if (entry.isDirectory()) walk(path, depth + 1);
      else if (entry.isFile() && CODE_EXTENSIONS.has(extname(entry.name))) file(path);
    }
  };
  walk("", 0);
  return { files, links, unread, stopped };
}
