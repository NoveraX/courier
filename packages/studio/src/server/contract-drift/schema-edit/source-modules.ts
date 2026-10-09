import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, sep } from "node:path";
import { createLogger } from "@noverax/courier";
import { type PathAliases, readPathAliases } from "@noverax/courier-studio-core/config";

import { type ParsedSource, parseSource } from "../../mocks-edit/plan/parse-source";
import { resolveConfigImport } from "../../resolve-config-import";

const log = createLogger("Studio");

/* A file larger than this holds no schema Studio edits. */
const MAX_BYTES = 512 * 1024;
const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const NO_ALIASES: PathAliases = { loader: {}, candidatesFor: () => [] };

/** The project's own modules, as a schema edit reads them: each parsed once. */
export interface SourceModules {
  /** The project's root, links resolved. */
  readonly root: string;
  /** The module at an absolute path, when it is the project's own source and parses cleanly. */
  module(path: string): ParsedSource | undefined;
  /** The file an import names, from the file that makes it, when it is a local one. */
  imported(from: string, specifier: string): string | undefined;
}

/**
 * Read the project's modules for a schema edit. A file outside the
 * project, in `node_modules`, too large, not a script, or that does not
 * parse cleanly is no module of its own: Studio edits only what it can
 * read whole. Imports resolve as the config loader resolves them, the
 * tsconfig's path aliases included.
 *
 * @param projectRoot - The project's root
 * @returns The modules
 * @example
 * ```ts
 * const modules = sourceModules(root);
 * modules.module(join(root, "src/api/schemas.ts"))?.program.body;
 * ```
 */
export function sourceModules(projectRoot: string): SourceModules {
  /* Every path it is asked about is one with its links resolved, as the loader gives them. */
  const root = realpathSync(projectRoot);
  const parsed = new Map<string, ParsedSource | undefined>();
  let aliases: PathAliases | undefined;
  return {
    root,
    module: (path) => {
      if (!parsed.has(path)) parsed.set(path, read(root, path));
      return parsed.get(path);
    },
    imported: (from, specifier) => {
      aliases ??= aliasesOf(root);
      const { file } = resolveConfigImport(dirname(from), specifier, aliases);
      return file === null ? undefined : realpathSync(file);
    },
  };
}

function read(root: string, path: string): ParsedSource | undefined {
  if (!isProjectSource(root, path) || !existsSync(path)) return undefined;
  if (statSync(path).size > MAX_BYTES) return undefined;
  const source = parseSource(path, readFileSync(path, "utf8"));
  return source.problem === null ? source : undefined;
}

function isProjectSource(root: string, path: string): boolean {
  const inside = relative(root, path);
  return (
    inside !== "" &&
    !inside.startsWith("..") &&
    !isAbsolute(inside) &&
    !inside.split(sep).includes("node_modules") &&
    SOURCE_FILE.test(path)
  );
}

function aliasesOf(root: string): PathAliases {
  try {
    return readPathAliases(root);
  } catch (error) {
    log.warn(
      "Could not read the tsconfig paths; a schema behind an aliased import is not edited",
      error,
    );
    return NO_ALIASES;
  }
}
