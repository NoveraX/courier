import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

import { SETUP_LIMITS } from "../limits";
import { resolveBin } from "./resolve-in-project";
import { runTool } from "./run-tool";
import { baseProject, tsProjects } from "./ts-projects";

/** What the setup touched: the files it added, and the lines it changed in files of the project's. */
export interface Touched {
  readonly added: readonly string[];
  readonly changed: ReadonlyMap<string, ReadonlySet<number>>;
}

/** How checking the setup's files went. */
export type TypecheckOutcome =
  | { readonly kind: "no-typescript" }
  | { readonly kind: "clean" }
  | { readonly kind: "errors"; readonly lines: readonly string[] }
  | { readonly kind: "unchecked"; readonly reason: string };

const TS_FILE = /\.[cm]?tsx?$/;
const VUE_FILE = /\.vue$/;
const ERROR = /^(.+?)\((\d+),\d+\): error TS\d+:/;
const CHECK_DIR = "node_modules/.cache/create-courier";
/* The error lines kept, of the files the setup touched and of the project as a whole: enough to show what is wrong. */
const MAX_ERROR_LINES = 500;

/* The same path whichever way the system spells it — /tmp and /private/tmp on macOS. */
function canonical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

interface Findings {
  readonly listed: Set<string>;
  readonly errors: string[];
  readonly global: string[];
  /** Whether a check ran past its time and was stopped. */
  timedOut: boolean;
}

/* An error counts when it is in a file the setup added, or on a line it changed. */
function isOurs(path: string, line: number, touched: Touched): boolean {
  return touched.added.includes(path) || touched.changed.get(path)?.has(line) === true;
}

/* Read TypeScript's output a line at a time, as it comes: the errors that count, kept within their bound, and the files it checked. */
function lineReader(root: string, touched: Touched, findings: Findings): (line: string) => void {
  let keeping = false;
  return (line) => {
    const error = ERROR.exec(line);
    if (error) {
      const at = error[1] ?? "";
      const path = (isAbsolute(at) ? relative(root, at) : at).replaceAll("\\", "/");
      keeping = isOurs(path, Number(error[2]), touched);
    } else if (/^error TS\d+:/.test(line)) {
      if (findings.global.length < MAX_ERROR_LINES) findings.global.push(line);
      keeping = false;
    } else if (
      isAbsolute(line.trim()) &&
      (TS_FILE.test(line.trim()) || VUE_FILE.test(line.trim()))
    ) {
      findings.listed.add(canonical(line.trim()));
      keeping = false;
    } else if (!line.startsWith(" ")) keeping = false;
    if (keeping && findings.errors.length < MAX_ERROR_LINES) findings.errors.push(line);
  };
}

/* A tsconfig that checks the files no project of the project's includes, as the base project would. */
function uncoveredConfig(root: string, base: string, files: readonly string[]): string | undefined {
  if (!existsSync(join(root, "node_modules"))) return undefined;
  const dir = join(root, CHECK_DIR);
  mkdirSync(dir, { recursive: true });
  const up = relative(dir, root).replaceAll("\\", "/");
  const config = {
    extends: `${up}/${base}`,
    compilerOptions: {
      noEmit: true,
      rootDir: up,
      composite: false,
      incremental: false,
      tsBuildInfoFile: null,
    },
    files: files.map((file) => `${up}/${file}`),
    include: [],
  };
  writeFileSync(join(dir, "tsconfig.json"), `${JSON.stringify(config, null, 2)}\n`);
  return `${CHECK_DIR}/tsconfig.json`;
}

/**
 * Check what the setup touched against the project's own TypeScript and
 * configs — with vue-tsc where the project has it, which reads .vue files
 * too: each project its tsconfig stands for, and — for a file none of them
 * includes, a config at the root say — a check that extends one of them. Errors count in the files it added and on the lines it changed;
 * the rest of the project is the person's to check.
 *
 * @param root - The project's folder
 * @param touched - What the setup added and changed
 * @param unprepared - Why what their types read is not there, where a program that writes it failed: nothing is checked then
 * @returns How it went: clean, the errors, or why nothing could be checked
 * @example
 * ```ts
 * const outcome = await typecheckTouched(root, { added: written, changed: new Map() });
 * ```
 */
export async function typecheckTouched(
  root: string,
  touched: Touched,
  unprepared?: string,
): Promise<TypecheckOutcome> {
  /* vue-tsc is tsc that reads .vue files too, where a Vue project has it. */
  const vueTsc = resolveBin(root, "vue-tsc", "vue-tsc");
  const tsc = vueTsc ?? resolveBin(root, "typescript", "tsc");
  if (tsc === undefined) return { kind: "no-typescript" };
  if (unprepared !== undefined) return { kind: "unchecked", reason: unprepared };
  const checked = (path: string) =>
    TS_FILE.test(path) || (vueTsc !== undefined && VUE_FILE.test(path));
  const ours = [...touched.added, ...touched.changed.keys()].filter(checked);
  const findings: Findings = { listed: new Set(), errors: [], global: [], timedOut: false };
  const projects = tsProjects(root);
  const check = async (project: string) => {
    const args = ["--noEmit", "--pretty", "false", "--listFiles", "-p", project];
    const { stopped } = await runTool([process.execPath, tsc, ...args], {
      cwd: root,
      output: { kind: "lines", line: lineReader(root, touched, findings) },
      deadlineMs: SETUP_LIMITS.typecheckMs,
    });
    if (stopped === "deadline") findings.timedOut = true;
  };
  for (const project of projects) await check(project);
  const uncovered = ours.filter((path) => !findings.listed.has(canonical(join(root, path))));
  const extra =
    uncovered.length > 0 ? uncoveredConfig(root, baseProject(projects), uncovered) : undefined;
  if (extra !== undefined) await check(extra);
  if (findings.errors.length > 0) return { kind: "errors", lines: findings.errors };
  if (findings.timedOut) {
    const minutes = Math.round(SETUP_LIMITS.typecheckMs / 60_000);
    return { kind: "unchecked", reason: `it was stopped after ${minutes} minutes` };
  }
  const covered = ours.some((path) => findings.listed.has(canonical(join(root, path))));
  if (!covered && findings.global.length > 0)
    return { kind: "unchecked", reason: findings.global[0] ?? "" };
  return { kind: "clean" };
}
