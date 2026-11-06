import { dirname, join } from "node:path";
import { urlWithoutSecrets } from "@noverax/courier/internal";

import { SETUP_LIMITS } from "../limits";
import { resolveInProject } from "./resolve-in-project";
import { runTool, toolFailure } from "./run-tool";
import { SetupFailure } from "./setup-failure";

/* A specification as a message names it: an address without the credentials or query it may carry. */
function shown(spec: string): string {
  return /^https?:\/\//i.test(spec) ? urlWithoutSecrets(spec) : spec;
}

/**
 * Import a specification into the project with Studio's own command, as
 * installed there: the typed code written and the API declared in
 * `courier.config.ts`. A relative path is read from where the person ran
 * this command. Node runs Studio's command itself, never through a shell:
 * the specification is the person's text.
 *
 * @param root - The project's folder
 * @param spec - The specification: a URL or a file
 * @param name - The API's name, when not taken from the specification
 * @param signal - Stops the import once the person cancels
 * @throws {SetupFailure} `IMPORT_FAILED` when Studio is not installed or its import fails, `CANCELLED` when stopped
 * @example
 * ```ts
 * await importSpecification(root, "https://petstore3.swagger.io/api/v3/openapi.json", undefined, signal);
 * ```
 */
export async function importSpecification(
  root: string,
  spec: string,
  name: string | undefined,
  signal?: AbortSignal,
): Promise<void> {
  const manifest = resolveInProject(root, "@noverax/courier-studio/package.json");
  if (manifest === undefined)
    throw new SetupFailure(
      "IMPORT_FAILED",
      "@noverax/courier-studio is not installed in the project, so nothing was imported",
    );
  const cli = join(dirname(manifest), "lib", "cli.js");
  const args = ["import", spec, "--yes", "--cwd", root, ...(name ? ["--name", name] : [])];
  const result = await runTool([process.execPath, cli, ...args], {
    cwd: process.cwd(),
    output: { kind: "show", on: "stdout" },
    deadlineMs: SETUP_LIMITS.importMs,
    signal,
  });
  if (signal?.aborted === true || result.stopped === "cancelled")
    throw new SetupFailure("CANCELLED", `The import of ${shown(spec)} was cancelled`);
  if (result.status === 0 && result.stopped === undefined) return;
  const failed = toolFailure(
    ["courier-studio", "import", shown(spec)],
    result,
    SETUP_LIMITS.importMs,
  );
  throw new SetupFailure("IMPORT_FAILED", `Studio's import: ${failed}`);
}
