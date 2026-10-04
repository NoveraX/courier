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

import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";
import { createLogger } from "@noverax/courier";

import { readTsconfigFile } from "./read-tsconfig-file";

const log = createLogger("Studio");

/** A tsconfig's path mapping, with its targets' base already resolved. */
export interface TsconfigPaths {
  /** Absolute directory that every target in `paths` resolves against. */
  baseUrl: string;
  /** `compilerOptions.paths` exactly as declared, patterns included. */
  paths: Readonly<Record<string, readonly string[]>>;
}

/**
 * Read the path mapping that applies to files in `directory`: the one of the
 * nearest `tsconfig.json` at or above it, as TypeScript finds it, so a config
 * file kept below the project root — `deploy/server.config.ts` — keeps every
 * alias the project declares.
 *
 * @param directory - Directory of the file whose imports are resolved
 * @returns The mapping, or `null` when no tsconfig declares one
 *
 * @example
 * ```ts
 * const mapping = readTsconfigPaths("/app/deploy");
 * // → { baseUrl: "/app", paths: { "@/*": ["./src/*"] } }
 * ```
 */
export function readTsconfigPaths(directory: string): TsconfigPaths | null {
  const tsconfig = nearestTsconfig(resolve(directory));
  return tsconfig ? findPaths(tsconfig, new Set()) : null;
}

function nearestTsconfig(directory: string): string | null {
  for (let dir = directory; ; dir = dirname(dir)) {
    const candidate = resolve(dir, "tsconfig.json");
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

/** Walk the `extends` chain depth-first, stopping at the first declared map. */
function findPaths(file: string, visited: Set<string>): TsconfigPaths | null {
  const path = resolve(file);
  if (visited.has(path)) return null;
  visited.add(path);

  const config = readTsconfigFile(path);
  if (!config) return null;

  if (config.paths) {
    return { baseUrl: resolve(dirname(path), config.baseUrl ?? "."), paths: config.paths };
  }

  /* A later entry in an `extends` array overrides an earlier one. */
  for (const specifier of [...config.extends].reverse()) {
    const parent = resolveExtends(specifier, dirname(path));
    if (!parent) {
      log.warn(
        `${path} extends "${specifier}", which cannot be found, so its path aliases are not read`,
      );
      continue;
    }
    const found = findPaths(parent, visited);
    if (found) return found;
  }
  return null;
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
    /* A package names its config, or ships the conventional one. */
    const found = resolveFrom(requireFrom, target);
    if (found) return found;
  }
  return null;
}

function resolveFrom(requireFrom: NodeJS.Require, target: string): string | null {
  try {
    return requireFrom.resolve(target);
  } catch (err) {
    log.debug(`"${target}" does not resolve to a tsconfig`, err);
    return null;
  }
}
