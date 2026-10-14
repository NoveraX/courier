import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

import { resolvedRoot } from "./resolved-root";

/** The files a project's variables are read from in development, the first to set one winning. */
const DEVELOPMENT_ENV_FILES = [".env.development.local", ".env.local", ".env.development", ".env"];

/** The `--dotenv` option of each command that reads `courier.config.ts`. */
export const DOTENV_ARG = {
  type: "string",
  valueHint: "files",
  description:
    "Env files to load before courier.config.ts, comma-separated, relative to the root (default: .env.development.local, .env.local, .env.development and .env, those there are)",
} as const;

/** A project's variables, as its env files give them, read again when the files change. */
export interface ProjectEnv {
  /** Every file the variables may come from, absolute: those there are, and those that may be made. */
  readonly files: readonly string[];
  /** The files the last reading found, as named. */
  readonly loaded: readonly string[];
  /**
   * Read the files again: a variable they set takes the value they give it
   * now, one they no longer set is gone, and one the process was started
   * with keeps its own.
   *
   * @returns The names of the variables whose value changed
   */
  reread(): string[];
}

/* What the files there are give, the first to set a variable winning, those the process has left out. */
function readFiles(
  names: readonly string[],
  files: readonly string[],
  fromProcess: ReadonlySet<string>,
): { variables: Map<string, string>; read: string[] } {
  const variables = new Map<string, string>();
  const read: string[] = [];
  names.forEach((name, at) => {
    const path = files[at];
    if (path === undefined || !existsSync(path)) return;
    read.push(name);
    for (const [key, value] of Object.entries(parseEnv(readFileSync(path, "utf8")))) {
      if (value !== undefined && !fromProcess.has(key) && !variables.has(key)) {
        variables.set(key, value);
      }
    }
  });
  return { variables, read };
}

/* Put what the files give now in place of what they gave: a variable they no longer
   set is unset, unless something else has given it another value since. */
function applyVariables(
  applied: ReadonlyMap<string, string>,
  next: ReadonlyMap<string, string>,
): string[] {
  const keys = new Set([...applied.keys(), ...next.keys()]);
  const changed = [...keys].filter((key) => applied.get(key) !== next.get(key));
  for (const [key, value] of applied) {
    if (!next.has(key) && process.env[key] === value) Reflect.deleteProperty(process.env, key);
  }
  for (const [key, value] of next) process.env[key] = value;
  return changed;
}

function namesOf(named: string | undefined): readonly string[] {
  if (named === undefined) return DEVELOPMENT_ENV_FILES;
  return named
    .split(",")
    .map((file) => file.trim())
    .filter((file) => file !== "");
}

/**
 * Read a project's variables before its config is, as a framework's
 * development server does, so a source's `baseURL: process.env.API_URL`
 * reaches the same address in Studio as in the application: from the files
 * `--dotenv` names, or else from `.env.development.local`, `.env.local`,
 * `.env.development` and `.env` — those there are. A variable keeps the
 * first value the files give it, and one the process was started with
 * keeps its own, then and on every reading after.
 *
 * @param root - The project's root
 * @param named - The files `--dotenv` names, comma-separated; absent, the development set
 * @returns The variables, read once already
 * @throws {Error} When a file `--dotenv` names is not there
 * @example
 * ```ts
 * const env = createProjectEnv("/app");
 * env.loaded; // → [".env.local", ".env"]
 * env.reread(); // → ["API_URL"], after .env.local gave API_URL another value
 * ```
 */
export function createProjectEnv(root: string, named?: string): ProjectEnv {
  const fromProcess = new Set(Object.keys(process.env));
  const names = namesOf(named);
  /* The root as Studio watches it, links resolved, so a change is told of the path it watches. */
  const base = resolvedRoot(root);
  const files = names.map((name) => resolve(base, name));
  if (named !== undefined) {
    names.forEach((name, at) => {
      if (!existsSync(files[at] ?? "")) {
        throw new Error(`--dotenv ${name}: there is no file at ${files[at]}`);
      }
    });
  }
  let applied: ReadonlyMap<string, string> = new Map();
  let loaded: string[] = [];
  function reread(): string[] {
    const { variables, read } = readFiles(names, files, fromProcess);
    const changed = applyVariables(applied, variables);
    applied = variables;
    loaded = read;
    return changed;
  }
  reread();
  return {
    files,
    get loaded() {
      return loaded;
    },
    reread,
  };
}

/**
 * Read a project's variables once, before a command reads its config: as
 * {@link createProjectEnv} reads them, for a command that does not watch.
 *
 * @param root - The project's root
 * @param named - The files `--dotenv` names, comma-separated; absent, the development set
 * @returns The files loaded, as named
 * @throws {Error} When a file `--dotenv` names is not there
 * @example
 * ```ts
 * loadProjectEnv("/app"); // → [".env.local", ".env"]
 * loadProjectEnv("/app", ".env.staging");
 * ```
 */
export function loadProjectEnv(root: string, named?: string): string[] {
  return [...createProjectEnv(root, named).loaded];
}
