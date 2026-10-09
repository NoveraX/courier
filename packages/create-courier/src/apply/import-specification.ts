import { dirname, join } from "node:path";

import { resolveInProject } from "./resolve-in-project";
import { runTool } from "./run-tool";

/**
 * Import a specification into the project with Studio's own command, as
 * installed there: the typed code written and the API declared in
 * `courier.config.ts`. A relative path is read from where the person ran
 * this command.
 *
 * @param root - The project's folder
 * @param spec - The specification: a URL or a file
 * @param name - The API's name, when not taken from the specification
 * @returns The import's exit status
 * @throws {Error} When Studio is not installed in the project
 * @example
 * ```ts
 * await importSpecification(root, "https://petstore3.swagger.io/api/v3/openapi.json", undefined);
 * ```
 */
export async function importSpecification(
  root: string,
  spec: string,
  name: string | undefined,
): Promise<number> {
  const manifest = resolveInProject(root, "@noverax/courier-studio/package.json");
  if (manifest === undefined)
    throw new Error(
      "@noverax/courier-studio is not installed in the project, so nothing was imported",
    );
  const cli = join(dirname(manifest), "lib", "cli.js");
  const args = ["import", spec, "--yes", "--cwd", root, ...(name ? ["--name", name] : [])];
  const { status } = await runTool([process.execPath, cli, ...args], process.cwd(), false);
  return status;
}
