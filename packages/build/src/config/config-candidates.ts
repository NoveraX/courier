import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { isRecord } from "../util/is-record";

/** The file names a Courier config may have, in the order they are looked for */
export const CONFIG_BASENAMES: ReadonlyArray<string> = [
  "courier.config.ts",
  "courier.config.mts",
  "courier.config.cts",
  "courier.config.js",
  "courier.config.mjs",
  "courier.config.cjs",
];

/* What marks the top of a project: its repository, or the root of a pnpm workspace. */
const PROJECT_TOP_MARKERS: ReadonlyArray<string> = [".git", ".hg", ".jj", "pnpm-workspace.yaml"];

/**
 * Every path a config is looked for at from a folder, in the order it is
 * looked for: each of {@link CONFIG_BASENAMES} in the folder, then in each
 * folder above it, up to the top of the project — the first folder that
 * holds its repository (`.git`, `.hg`, `.jj`) or is the root of its
 * workspace (`pnpm-workspace.yaml`, or a `package.json` that declares
 * `workspaces`) — or, with no such folder, the root of the file system.
 *
 * @param startDir - The folder to look in first
 * @returns The paths, absolute, whether there or not
 * @example
 * ```ts
 * configCandidates("/repo/apps/web"); // → ["/repo/apps/web/courier.config.ts", …, "/repo/courier.config.cjs"]
 * ```
 */
export function configCandidates(startDir: string): string[] {
  const candidates: string[] = [];
  let dir = resolve(startDir);
  while (true) {
    for (const basename of CONFIG_BASENAMES) candidates.push(join(dir, basename));
    const parent = dirname(dir);
    if (parent === dir || isProjectTop(dir)) return candidates;
    dir = parent;
  }
}

function isProjectTop(dir: string): boolean {
  return (
    PROJECT_TOP_MARKERS.some((marker) => existsSync(join(dir, marker))) ||
    declaresWorkspaces(join(dir, "package.json"))
  );
}

/* A manifest that cannot be read or parsed declares nothing: the package manager would refuse it too. */
function declaresWorkspaces(manifest: string): boolean {
  if (!existsSync(manifest)) return false;
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
    return isRecord(parsed) && parsed.workspaces !== undefined;
  } catch {
    return false;
  }
}
