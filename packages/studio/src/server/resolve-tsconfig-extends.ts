import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join, resolve } from "node:path";
import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

/** Where a tsconfig's `extends` specifier leads. */
export interface ResolvedTsconfigExtends {
  /** The tsconfig it names, or `null` when it names none. */
  file: string | null;
  /** Each absent path that, created, would be the tsconfig it names instead. */
  absent: string[];
}

/**
 * Resolve an `extends` specifier as the path-alias reader does: a path, the
 * `tsconfig.json` in a directory, the path with `.json`, or an installed
 * package's file or its `tsconfig.json`.
 *
 * The absent paths come only from a path specifier, and only those the reader
 * looks at before the one it takes. A package that is not installed yields
 * none: installing one is no edit of the project.
 *
 * @param specifier - The specifier, exactly as written
 * @param fromDir - The directory of the tsconfig it is written in
 * @returns The file it names, and each absent path that would take its place
 *
 * @example
 * ```ts
 * resolveTsconfigExtends("./tsconfig.base", "/app");
 * // tsconfig.base.json exists → { file: "/app/tsconfig.base.json", absent: ["/app/tsconfig.base"] }
 * ```
 */
export function resolveTsconfigExtends(
  specifier: string,
  fromDir: string,
): ResolvedTsconfigExtends {
  if (specifier.startsWith(".") || isAbsolute(specifier)) {
    return resolvePath(resolve(fromDir, specifier));
  }
  return { file: resolvePackage(specifier, fromDir), absent: [] };
}

function resolvePath(candidate: string): ResolvedTsconfigExtends {
  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    const nested = join(candidate, "tsconfig.json");
    return existsSync(nested) ? { file: nested, absent: [] } : { file: null, absent: [nested] };
  }
  if (existsSync(candidate)) return { file: candidate, absent: [] };
  const suffixed = `${candidate}.json`;
  if (existsSync(suffixed)) return { file: suffixed, absent: [candidate] };
  return { file: null, absent: [candidate, suffixed] };
}

function resolvePackage(specifier: string, fromDir: string): string | null {
  const requireFrom = createRequire(join(fromDir, "tsconfig.json"));
  for (const target of [specifier, `${specifier}/tsconfig.json`]) {
    try {
      return requireFrom.resolve(target);
    } catch (error) {
      log.debug(`${target} resolves to no tsconfig from ${fromDir}`, error);
    }
  }
  return null;
}
