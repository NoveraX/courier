import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { addCourier, type Terminal } from "./add-courier";
import { checkRun } from "./check-run";
import type { CreateRun } from "./create-run";
import { createProject } from "./new-project/create-project";

/* A folder a new project can be created in: there is nothing there, or nothing but dotfiles a clone brings. */
function isFree(root: string): boolean {
  return !existsSync(root) || readdirSync(root).every((name) => name.startsWith("."));
}

/**
 * Set Courier up where the command was pointed: in the project there, or
 * — in a folder with nothing in it yet — in a new project.
 *
 * @param run - What the command line asked for
 * @param terminal - Where to write, and whether to ask
 * @returns The exit status
 * @example
 * ```ts
 * process.exitCode = await createCourier({ dir: "my-app", framework: "next" }, terminal);
 * ```
 */
export async function createCourier(run: CreateRun, terminal: Terminal): Promise<number> {
  checkRun(run);
  const root = resolve(run.dir ?? process.cwd());
  if (existsSync(join(root, "package.json"))) return addCourier(root, run, terminal);
  if (!isFree(root)) {
    throw new Error(
      `${root} holds files but no package.json: point the command at a project, or at a new folder`,
    );
  }
  return createProject(root, run, terminal);
}
