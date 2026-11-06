import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { CreateRun } from "./create-run";

/**
 * What is wrong with a specification to import, as it was given: a URL
 * that is none, or a file that is not there. A relative path is read from
 * where the command runs; `-` is standard input.
 *
 * @param spec - The specification: a URL, a file, or `-`
 * @returns What is wrong, or `undefined` where nothing is
 * @example
 * ```ts
 * specificationProblem("./no-such-spec.json"); // "there is no ./no-such-spec.json here, at /work/shop/no-such-spec.json"
 * ```
 */
export function specificationProblem(spec: string): string | undefined {
  if (spec === "") return "it names no URL or file";
  if (spec === "-") return undefined;
  if (/^https?:\/\//i.test(spec))
    return URL.canParse(spec) ? undefined : `no URL can be read from ${spec}`;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(spec))
    return "a URL to import from starts with https:// or http://";
  return existsSync(resolve(spec)) ? undefined : `there is no ${spec} here, at ${resolve(spec)}`;
}

/**
 * Refuse, before anything is asked or changed, what the command line asks
 * for and the command cannot follow: the example beside an import, which
 * takes its place; the example's mock without the example, without
 * Studio, which runs it, or beside an import; an import without Studio,
 * which runs it; a specification that is no URL or a file that is not
 * there; and an API's name with no import to give it to.
 *
 * @param run - What the command line asked for
 * @throws {Error} Naming the option to change
 * @example
 * ```ts
 * checkRun({ openapi: "./openapi.json", studio: false }); // throws: leave out --no-studio
 * ```
 */
export function checkRun(run: CreateRun): void {
  if (run.mocks === true && run.example === false)
    throw new Error("--mocks adds the example's mock: leave out --no-example");
  if (run.mocks === true && run.studio === false)
    throw new Error("--mocks adds the example's mock, which Studio runs: leave out --no-studio");
  const { openapi } = run;
  if (openapi === undefined) {
    if (run.name !== undefined)
      throw new Error("--name names the API --openapi imports: give the two together");
    return;
  }
  if (run.example === true)
    throw new Error(
      "--example adds the example API, and --openapi imports yours in its place: give one of the two",
    );
  if (run.mocks === true)
    throw new Error(
      "--mocks adds the example's mock, and --openapi imports your API in the example's place: leave out --mocks",
    );
  if (run.studio === false)
    throw new Error("--openapi imports with Studio's command: leave out --no-studio");
  const problem = specificationProblem(openapi);
  if (problem !== undefined) throw new Error(`--openapi: ${problem}`);
}
