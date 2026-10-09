import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

import { resolveInProject } from "./resolve-in-project";
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
const ERROR = /^(.+?)\((\d+),\d+\): error TS\d+:/;
const CHECK_DIR = "node_modules/.cache/create-courier";

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
}

/* An error counts when it is in a file the setup added, or on a line it changed. */
function isOurs(path: string, line: number, touched: Touched): boolean {
  return touched.added.includes(path) || touched.changed.get(path)?.has(line) === true;
}

function read(output: string, root: string, touched: Touched, findings: Findings): void {
  let keeping = false;
  for (const line of output.split(/\r?\n/)) {
    const error = ERROR.exec(line);
    if (error) {
      const at = error[1] ?? "";
      const path = (isAbsolute(at) ? relative(root, at) : at).replaceAll("\\", "/");
      keeping = isOurs(path, Number(error[2]), touched);
    } else if (/^error TS\d+:/.test(line)) {
      findings.global.push(line);
      keeping = false;
    } else if (isAbsolute(line.trim()) && TS_FILE.test(line.trim())) {
      findings.listed.add(canonical(line.trim()));
      keeping = false;
    } else if (!line.startsWith(" ")) keeping = false;
    if (keeping) findings.errors.push(line);
  }
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
 * configs: each project its tsconfig stands for, and — for a file none of
 * them includes, a config at the root say — a check that extends one of
 * them. Errors count in the files it added and on the lines it changed;
 * the rest of the project is the person's to check.
 *
 * @param root - The project's folder
 * @param touched - What the setup added and changed
 * @returns How it went: clean, the errors, or why nothing could be checked
 * @example
 * ```ts
 * const outcome = await typecheckTouched(root, { added: written, changed: new Map() });
 * ```
 */
export async function typecheckTouched(root: string, touched: Touched): Promise<TypecheckOutcome> {
  const tsc = resolveInProject(root, "typescript/bin/tsc");
  if (tsc === undefined) return { kind: "no-typescript" };
  const ours = [...touched.added, ...touched.changed.keys()].filter((path) => TS_FILE.test(path));
  const findings: Findings = { listed: new Set(), errors: [], global: [] };
  const projects = tsProjects(root);
  const check = async (project: string) => {
    const args = ["--noEmit", "--pretty", "false", "--listFiles", "-p", project];
    const { output } = await runTool([process.execPath, tsc, ...args], root, true);
    read(output, root, touched, findings);
  };
  for (const project of projects) await check(project);
  const uncovered = ours.filter((path) => !findings.listed.has(canonical(join(root, path))));
  const extra =
    uncovered.length > 0 ? uncoveredConfig(root, baseProject(projects), uncovered) : undefined;
  if (extra !== undefined) await check(extra);
  if (findings.errors.length > 0) return { kind: "errors", lines: findings.errors };
  const checked = ours.some((path) => findings.listed.has(canonical(join(root, path))));
  if (!checked && findings.global.length > 0)
    return { kind: "unchecked", reason: findings.global[0] ?? "" };
  return { kind: "clean" };
}
