/**
 * Find the file that declares a source.
 *
 * A generated mock server imports the source by name, so it needs the module
 * that exports it. An imported source records the files Studio wrote for it,
 * but a hand-written one is only known through the config — and the config
 * imports it rather than re-exporting it, so pointing the mock at the config
 * produced an import of a name that file does not export.
 *
 * The config's own dependency list is the candidate set, so this reads a known
 * handful of files rather than searching the project.
 */

import { readFileSync } from "node:fs";
import { relative } from "node:path";

/** Files larger than this are not where a `defineApi` call lives. */
const MAX_BYTES = 512 * 1024;

/**
 * Locate the module that exports `name`, among the config's dependencies.
 *
 * @param name - Source name as the config keys it
 * @param deps - Absolute paths the config transitively imports
 * @param projectRoot - Root the returned path is relative to
 * @returns Project-relative path, or `undefined` when no file claims the name
 *
 * @example
 * ```ts
 * findSourceDeclaration("billing", deps, root) // → "src/api/billing.ts"
 * ```
 */
export function findSourceDeclaration(
  name: string,
  deps: readonly string[],
  projectRoot: string,
): string | undefined {
  const declaration = new RegExp(
    `export\\s+(?:const|let|var|function)\\s+${escapeForRegex(name)}\\b`,
  );
  const named = new RegExp(`export\\s*\\{[^}]*\\b${escapeForRegex(name)}\\b[^}]*\\}`);

  for (const dep of deps) {
    const source = read(dep);
    if (source === undefined) continue;
    if (declaration.test(source) || named.test(source)) {
      return relative(projectRoot, dep);
    }
  }
  return undefined;
}

function read(path: string): string | undefined {
  try {
    const source = readFileSync(path, "utf-8");
    return source.length > MAX_BYTES ? undefined : source;
  } catch {
    /* A dependency that cannot be read simply does not answer for the name. */
    return undefined;
  }
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
