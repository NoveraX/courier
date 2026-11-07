import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { SETUP_LIMITS } from "../limits";
import type { Plan } from "../plan/build-plan";
import type { RecipeContext } from "../recipes/recipe-types";
import type { SetupReport } from "../report/setup-report";
import { runTool, toolFailure } from "./run-tool";

/* What a program's output is painted with, and the lines of it that say no reason: a stack's frames, Node's version, the caret under a line of code. */
const PAINT = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g");
const NO_REASON = /^\s+at\s|^\s+\.\.\. \d+ lines? matching|^Node\.js v\d|^\s*[\^~]+\s*$/;
/* A line that names an error and says what it is: `Error: …`, `TypeError: …`, `AstroError [ConfigLoadError]: …`, a bundler's `[UNRESOLVED_IMPORT] …` — not a logger's level. */
const NAMED_ERROR =
  /^\s*(?:[\w$.]*(?:Error|Exception)(?:\s*\[[^\]]*\])?:\s+\S|\[(?!(?:WARN|WARNING|INFO|DEBUG|LOG|TRACE|NOTE)\])[A-Z][A-Z\d_]*\]\s+\S)/;
/* A line that says an error with a word alone, a logger's `[error]`, `error …`, `ERR!`, and one that only heads the lines below it, as Vite's `error during build:`. */
const ERROR_WORD = /^\s*(?:\[error\]|error\b|ERR!)/i;
const HEADING = /:\s*$/;
/* The longest reason a warning shows, in characters. */
const REASON_CHARS = 300;
/* A program's name as a recipe writes it, and how many folders up from the project's its install is looked for: a workspace's root holds its programs. */
const BIN_NAME = /^[\w@.-]+$/;
const BIN_FOLDERS = 16;

/* Yarn's Plug'n'Play, which installs no node_modules: `yarn run` finds a program of the project's through it, and installs none. */
const PLUG_AND_PLAY = [".pnp.cjs", ".pnp.loader.mjs"];

/* Whether the project has a program installed: in its own node_modules/.bin, or a folder's above it, as a workspace installs it — or under Yarn's Plug'n'Play, where Yarn finds it, and says so where it is not. */
function installed(root: string, bin: string): boolean {
  if (!BIN_NAME.test(bin)) return false;
  let dir = resolve(root);
  for (let up = 0; up < BIN_FOLDERS; up++) {
    const bins = join(dir, "node_modules", ".bin");
    if ([bin, `${bin}.cmd`, `${bin}.exe`].some((name) => existsSync(join(bins, name)))) return true;
    if (PLUG_AND_PLAY.some((name) => existsSync(join(dir, name)))) return true;
    if (dirname(dir) === dir) return false;
    dir = dirname(dir);
  }
  return false;
}

/* The line of a failed program's output that says why, past its stack and Node's own lines: the first that names an error and says what it is; else the first that says an error with a word, or, where that only heads the lines below it, the first below that does not; else the last it printed. */
function reasonOf(tail: string): string | undefined {
  const lines = tail
    .replace(PAINT, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "" && !NO_REASON.test(line));
  const said = lines.findIndex((each) => ERROR_WORD.test(each));
  const line =
    lines.find((each) => NAMED_ERROR.test(each)) ??
    (said === -1 ? undefined : lines.slice(said).find((each) => !HEADING.test(each))) ??
    lines.at(-1);
  return line?.trim().slice(0, REASON_CHARS);
}

/**
 * Run the programs that write the types the added files read — Astro's
 * `astro sync` — once the packages are installed, each only where the
 * project has it installed, so none is ever installed to run it. One
 * that fails is reported with the line of its output that says why, not
 * its stack, and one the project does not have as not in it; the type
 * check then checks nothing: what the files read is not there.
 *
 * @param ctx - The project, and what is set up in it
 * @param plan - The plan
 * @param report - Where to tell of one that fails
 * @param signal - Stops them once the person cancels, which the setup then undoes
 * @returns Why the added files' types are not checked, where one failed
 * @example
 * ```ts
 * const unprepared = await prepare(ctx, plan, io.report, signal);
 * ```
 */
export async function prepare(
  ctx: RecipeContext,
  plan: Plan,
  report: SetupReport,
  signal?: AbortSignal,
): Promise<string | undefined> {
  let unprepared: string | undefined;
  for (const { bin, args } of plan.prepare) {
    if (!installed(ctx.project.root, bin)) {
      const reason = `${bin} is not installed in the project`;
      report.prepareFailed(`${[bin, ...args].join(" ")} was not run`, [reason]);
      unprepared ??= reason;
      continue;
    }
    const command = ctx.manager.exec(bin, args);
    const result = await runTool(command, {
      cwd: ctx.project.root,
      output: { kind: "quiet" },
      deadlineMs: SETUP_LIMITS.prepareMs,
      signal,
    });
    if (result.stopped === "cancelled" || signal?.aborted === true) return unprepared;
    if (result.status !== 0 || result.stopped !== undefined) {
      const reason = reasonOf(result.tail);
      report.prepareFailed(
        toolFailure(command, result, SETUP_LIMITS.prepareMs),
        reason === undefined ? [] : [reason],
      );
      unprepared ??= `${[bin, ...args].join(" ")} did not write the types the added files read`;
    }
  }
  return unprepared;
}
