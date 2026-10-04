import { existsSync, realpathSync } from "node:fs";
import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

/* An absent path, or a broken link, names no file but itself. */
function fileOf(path: string): string {
  if (!existsSync(path)) return path;
  try {
    return realpathSync(path);
  } catch (error) {
    log.debug(`${path} went away while Studio looked it up`, error);
    return path;
  }
}

/**
 * The watched paths that name one file between them — a link and its target
 * — each with the others that name its file.
 *
 * @param paths - The watched paths
 * @returns The other names of each path that has any
 * @example
 * ```ts
 * pathAliases(["/app/courier.config.ts", "/app/config/courier.config.ts"]);
 * // → Map { "/app/courier.config.ts" => ["/app/config/courier.config.ts"], ... } when the first links to the second
 * ```
 */
export function pathAliases(paths: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const byFile = new Map<string, string[]>();
  for (const path of paths) {
    const file = fileOf(path);
    byFile.set(file, [...(byFile.get(file) ?? []), path]);
  }
  const aliases = new Map<string, readonly string[]>();
  for (const names of byFile.values()) {
    if (names.length < 2) continue;
    for (const path of names)
      aliases.set(
        path,
        names.filter((other) => other !== path),
      );
  }
  return aliases;
}
