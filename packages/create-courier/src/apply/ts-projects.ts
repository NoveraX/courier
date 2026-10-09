import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { isRecord } from "../is-record";
import { parseJsonc } from "../project/jsonc";

/* Whether a tsconfig only stands for the projects it references, as Vite's and Nuxt's do. */
function isSolution(config: Record<string, unknown>): boolean {
  const empty = (value: unknown) => Array.isArray(value) && value.length === 0;
  return (
    Array.isArray(config.references) &&
    config.references.length > 0 &&
    (empty(config.files) || (config.files === undefined && empty(config.include)))
  );
}

/* The tsconfig a reference names: the file itself, or the tsconfig.json in the folder it names. */
function referenced(root: string, reference: unknown): string | undefined {
  if (!isRecord(reference) || typeof reference.path !== "string") return undefined;
  const path = resolve(root, reference.path);
  const file =
    existsSync(path) && statSync(path).isDirectory() ? join(path, "tsconfig.json") : path;
  return existsSync(file) ? relative(root, file).replaceAll("\\", "/") : undefined;
}

/**
 * The TypeScript projects a project checks its code with: its
 * `tsconfig.json`, or — where that only lists the projects it references,
 * as Vite's and Nuxt's do — each of those.
 *
 * @param root - The project's folder
 * @returns The tsconfig files, relative to the root
 * @example
 * ```ts
 * tsProjects("/work/shop"); // ["tsconfig.app.json", "tsconfig.node.json"] in a Vite app
 * ```
 */
export function tsProjects(root: string): string[] {
  let config: unknown;
  try {
    config = parseJsonc(readFileSync(join(root, "tsconfig.json"), "utf8"));
  } catch {
    /* TypeScript reads the file itself and says what is wrong with it. */
    return ["tsconfig.json"];
  }
  if (!isRecord(config) || !isSolution(config) || !Array.isArray(config.references))
    return ["tsconfig.json"];
  const projects = config.references.flatMap((reference) => referenced(root, reference) ?? []);
  return projects.length > 0 ? projects : ["tsconfig.json"];
}

/**
 * The project to check a file no project includes against — a config at
 * the root, say: the app's, whose module resolution its code is written
 * for, else the first. A Vite app's Node project resolves as Node does,
 * which would ask the root's files for extensions the app's code leaves out.
 *
 * @param projects - The projects, as `tsProjects` gives them
 * @returns The tsconfig to extend
 * @example
 * ```ts
 * baseProject(["tsconfig.app.json", "tsconfig.node.json"]); // "tsconfig.app.json"
 * ```
 */
export function baseProject(projects: readonly string[]): string {
  return projects.find((project) => /\bapp\b/i.test(project)) ?? projects[0] ?? "tsconfig.json";
}
