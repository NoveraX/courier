import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";

import type { TempProject } from "../vite/temp-project";
import { jsProject } from "../webpack/js-project";

/* The repository's packages, of which a project here takes Courier's alone. */
const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../../node_modules");

/**
 * A project of the shop and payments, with a `node_modules` of its own that
 * holds Courier's packages alone: the routes module Metro bundles is written
 * under it, in the project, and not in the repository's.
 *
 * @param files - More files, from the root, and their content
 * @returns The project
 * @example
 * ```ts
 * const project = metroProject({ "index.js": ENTRY });
 * ```
 */
export function metroProject(files: Record<string, string> = {}): TempProject {
  const project = jsProject(files);
  const modules = join(project.root, "node_modules");
  rmSync(modules);
  mkdirSync(modules);
  symlinkSync(join(REPO_NODE_MODULES, "@noverax"), join(modules, "@noverax"), "dir");
  return project;
}
