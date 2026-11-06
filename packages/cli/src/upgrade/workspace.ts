import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { UPGRADE_LIMITS } from "./limits";
import { workspacePatterns } from "./workspace-patterns";

/** A project's workspace: the folder its lockfile and install are in, and the folders of its packages. */
export interface Workspace {
  /** The folder, absolute. */
  readonly root: string;
  /** Each package's folder, relative to the root and `/`-separated; `""` for the root's own. */
  readonly packages: readonly string[];
}

/* Folders no workspace keeps a package of its own in. */
const SKIPPED = new Set(["node_modules", ".git"]);

/* The folders under `dir` that one glob's segments match: `*` one folder, `**` any depth of them. */
function expand(
  root: string,
  dir: string,
  segments: readonly string[],
  found: Set<string>,
  depth = 0,
): void {
  if (found.size >= UPGRADE_LIMITS.workspacePackages || depth > UPGRADE_LIMITS.workspaceDepth)
    return;
  const [segment, ...rest] = segments;
  if (segment === undefined) {
    if (existsSync(join(root, dir, "package.json"))) found.add(dir);
    return;
  }
  if (segment === "**") expand(root, dir, rest, found, depth);
  const names =
    segment === "*" || segment === "**"
      ? readdirSync(join(root, dir), { withFileTypes: true })
          .filter(
            (entry) =>
              entry.isDirectory() && !entry.name.startsWith(".") && !SKIPPED.has(entry.name),
          )
          .map((entry) => entry.name)
      : existsSync(join(root, dir, segment))
        ? [segment]
        : [];
  for (const name of names) {
    const next = dir === "" ? name : `${dir}/${name}`;
    expand(root, next, segment === "**" ? segments : rest, found, depth + 1);
  }
}

/**
 * The folders a workspace's globs name that hold a package: `apps/*`,
 * `packages/**`, `tools/cli`; a glob led by `!` leaves the folders it
 * names out. Walked within the workspace's limits.
 *
 * @param root - The workspace's folder
 * @param globs - Its globs
 * @returns The packages' folders, relative to the root
 * @example
 * ```ts
 * packagesOf("/work/shop", ["apps/*", "!apps/legacy"]); // ["apps/web", "apps/api"]
 * ```
 */
export function packagesOf(root: string, globs: readonly string[]): string[] {
  const named = (keep: boolean) => {
    const found = new Set<string>();
    for (const glob of globs.filter((each) => each.startsWith("!") !== keep)) {
      const segments = glob
        .replace(/^!/, "")
        .replace(/^\.\//, "")
        .split("/")
        .filter((part) => part !== "");
      expand(root, "", segments, found);
    }
    return found;
  };
  const left = named(false);
  return [...named(true)].filter((dir) => !left.has(dir)).sort();
}

/**
 * The workspace a folder is in: the nearest folder at or above it whose
 * globs name it, or that it is — the root an install runs in — with every
 * package its globs name; the folder alone where no workspace holds it.
 *
 * @param dir - Where the command was pointed
 * @returns The workspace
 * @example
 * ```ts
 * workspaceOf("/work/shop/apps/web"); // { root: "/work/shop", packages: ["", "apps/api", "apps/web"] }
 * ```
 */
export function workspaceOf(dir: string): Workspace {
  const start = resolve(dir);
  for (let at = start; ; at = dirname(at)) {
    const globs = workspacePatterns(at);
    if (globs !== undefined) {
      const packages = packagesOf(at, globs);
      const inside = relative(at, start).split(sep).join("/");
      if (inside === "" || packages.includes(inside))
        return { root: at, packages: ["", ...packages] };
    }
    if (dirname(at) === at) return { root: start, packages: [""] };
  }
}
