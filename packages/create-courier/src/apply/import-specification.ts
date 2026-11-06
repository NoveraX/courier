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

/* Studio's import says a server that wants credentials answered 401 or 403. */
const REFUSED = /\banswered 40[13]\b/;

/* What to do where the server wanted credentials, which the setup sends none of. */
const CREDENTIALS =
  "; the server asked for credentials, which the setup sends none of: download the specification, and import its file";

/**
 * Import a specification into the project with Studio's own command, as
 * installed there: the typed code written and the API declared in
 * `courier.config.ts`. A relative path is read from where the person ran
 * this command. Node runs Studio's command itself, never through a shell:
 * the specification is the person's text. Where the server asks for
 * credentials, answering 401 or 403, the failure says what to do: the
 * setup sends none.
 *
 * @param root - The project's folder
 * @param spec - The specification: a URL or a file
 * @param name - The API's name, when not taken from the specification
 * @param signal - Stops the import once the person cancels
 * @param on - Where Studio's output shows: the terminal's, or standard error beside the JSON document
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
  on: "stdout" | "stderr" = "stdout",
): Promise<void> {
  const manifest = resolveInProject(root, "@noverax/courier-studio/package.json");
  if (manifest === undefined)
    throw new SetupFailure(
      "IMPORT_FAILED",
      "@noverax/courier-studio is not installed in the project, so nothing was imported",
    );
  const cli = join(dirname(manifest), "lib", "cli.js");
  const args = ["import", spec, "--yes", "--cwd", root, ...(name ? ["--name", name] : [])];
  let refused = false;
  /* Each line is shown where it would show, and read for a server that refused to answer. */
  const result = await runTool([process.execPath, cli, ...args], {
    cwd: process.cwd(),
    /* A specification piped in is read from standard input; any other leaves it alone. */
    input: spec === "-" ? "inherit" : "ignore",
    output: {
      kind: "lines",
      line: (line, stream) => {
        refused ||= REFUSED.test(line);
        (on === "stdout" && stream === "stdout" ? process.stdout : process.stderr).write(
          `${line}\n`,
        );
      },
    },
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
  throw new SetupFailure(
    "IMPORT_FAILED",
    `Studio's import: ${failed}${refused ? CREDENTIALS : ""}`,
  );
}
