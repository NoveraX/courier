import {
  composeRoutesModule,
  projectRootAt,
  routesModulePath,
  routesSaid,
  writeRoutesModule,
} from "@noverax/courier-cli/devkit";
import type { ProjectReads } from "../../server/project-state/types";

/**
 * Write the routes module as the config now declares the project, once an
 * import is declared — Studio is not running to write it — and say what
 * became of it: a proxy caller takes its routes from there.
 *
 * @param root - The project root, symlinks resolved
 * @param project - The project, its config loaded again by the declaration
 * @returns The lines to print: none when the module is as it was, or the config keeps none
 * @example
 * ```ts
 * print(await routesLines(root, project)); // → ["Wrote courier.routes.ts: 3 endpoints a page may call, of pets"]
 * ```
 */
export async function routesLines(root: string, project: ProjectReads): Promise<string[]> {
  const { running } = project.snapshot();
  if (running === null) return [];
  const path = routesModulePath(running.configFile, running.config.studio?.routes);
  if (path === null) return [];
  const { module, problem } = composeRoutesModule(root, running, path);
  if (problem !== null) return [`Studio cannot write ${path}: ${problem}`];
  const outcome = await writeRoutesModule(projectRootAt(root), module);
  const [level, line] = routesSaid(outcome);
  return level === "debug" ? [] : [line];
}
