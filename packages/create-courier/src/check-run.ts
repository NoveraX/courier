import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { CreateRun } from "./create-run";

/**
 * Refuse, before anything is asked or changed, what the command line asks
 * for and the command cannot follow: an import without Studio, which runs
 * it; a specification file that is not there; and an API's name with no
 * import to give it to.
 *
 * @param run - What the command line asked for
 * @throws {Error} Naming the option to change
 * @example
 * ```ts
 * checkRun({ openapi: "./openapi.json", studio: false }); // throws: leave out --no-studio
 * ```
 */
export function checkRun(run: CreateRun): void {
  const { openapi } = run;
  if (openapi === undefined) {
    if (run.name !== undefined)
      throw new Error("--name names the API --openapi imports: give the two together");
    return;
  }
  if (run.studio === false)
    throw new Error("--openapi imports with Studio's command: leave out --no-studio");
  const local = !/^https?:\/\//i.test(openapi) && openapi !== "-";
  if (local && !existsSync(resolve(openapi)))
    throw new Error(`--openapi: there is no ${openapi} here, at ${resolve(openapi)}`);
}
