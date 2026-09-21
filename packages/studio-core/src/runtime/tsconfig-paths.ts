/**
 * Read a project's `compilerOptions.paths` without loading TypeScript.
 *
 * The compiler would do this for us, but its API is exactly what a config
 * reader must not depend on: it is an optional peer a JavaScript-only project
 * is entitled not to have, and TypeScript 7 publishes no parser under the
 * package root at all. Reading the file directly costs one JSONC parse.
 *
 * `paths` is not merged down an `extends` chain — TypeScript replaces the map
 * wholesale — so the nearest config that declares one wins, and its targets
 * resolve against its own `baseUrl`, or its own directory when it has none.
 *
 * Parsing is JSON5 rather than strict JSONC: a tsconfig is hand-edited and
 * routinely carries comments and trailing commas, both of which TypeScript
 * accepts. Refusing them would drop a real project's aliases without a word.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";
import { createLogger } from "@noverax/courier";
import { parseJSON5 } from "confbox";

const log = createLogger("Studio");

/** A tsconfig's path mapping, with its targets' base already resolved. */
export interface TsconfigPaths {
  /** Absolute directory that every target in `paths` resolves against. */
  baseUrl: string;
  /** `compilerOptions.paths` exactly as declared, patterns included. */
  paths: Readonly<Record<string, readonly string[]>>;
}

interface RawTsconfig {
  extends?: string | string[];
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };
}

/**
 * Read the path mapping that applies to `projectRoot`.
 *
 * @param projectRoot - Directory holding the project's `tsconfig.json`
 * @returns The mapping, or `null` when the project declares none
 *
 * @example
 * ```ts
 * const mapping = readTsconfigPaths("/app");
 * // → { baseUrl: "/app", paths: { "@/*": ["./src/*"] } }
 * ```
 */
export function readTsconfigPaths(projectRoot: string): TsconfigPaths | null {
  return findPaths(resolve(projectRoot, "tsconfig.json"), new Set());
}

/** Walk the `extends` chain depth-first, stopping at the first declared map. */
function findPaths(file: string, visited: Set<string>): TsconfigPaths | null {
  const path = resolve(file);
  if (visited.has(path)) return null;
  visited.add(path);

  const config = readTsconfig(path);
  if (!config) return null;

  const options = config.compilerOptions;
  if (options?.paths) {
    const dir = dirname(path);
    return { baseUrl: resolve(dir, options.baseUrl ?? "."), paths: options.paths };
  }

  /* A later entry in an `extends` array overrides an earlier one. */
  const inherited = typeof config.extends === "string" ? [config.extends] : (config.extends ?? []);
  for (const specifier of [...inherited].reverse()) {
    const parent = resolveExtends(specifier, dirname(path));
    const found = parent && findPaths(parent, visited);
    if (found) return found;
  }
  return null;
}

function readTsconfig(path: string): RawTsconfig | null {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    /* Absent or unreadable is the same answer as declaring nothing. */
    return null;
  }
  try {
    return parseJSON5(text) as RawTsconfig;
  } catch (err) {
    log.warn(`Could not parse ${path}, so its path aliases are ignored`, err);
    return null;
  }
}

/**
 * Resolve an `extends` specifier: a path, a directory holding a
 * `tsconfig.json`, or an installed package that ships one.
 */
function resolveExtends(specifier: string, fromDir: string): string | null {
  if (specifier.startsWith(".") || isAbsolute(specifier)) {
    const candidate = resolve(fromDir, specifier);
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      const nested = resolve(candidate, "tsconfig.json");
      return existsSync(nested) ? nested : null;
    }
    if (existsSync(candidate)) return candidate;
    const suffixed = `${candidate}.json`;
    return existsSync(suffixed) ? suffixed : null;
  }

  const requireFrom = createRequire(resolve(fromDir, "tsconfig.json"));
  for (const target of [specifier, `${specifier}/tsconfig.json`]) {
    try {
      return requireFrom.resolve(target);
    } catch {
      /* Try the package's conventional filename before giving up. */
    }
  }
  return null;
}
