import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createLogger } from "@noverax/courier";

const log = createLogger("Project");

/**
 * The `type` of the nearest package.json above a file, which Node and
 * TypeScript read to tell whether a `.js` or `.ts` file is an ES module.
 *
 * @param file - The file's absolute path
 * @returns The field as written; `undefined` when no package.json is above
 *   the file, or the nearest one declares no type or does not parse
 * @example
 * ```ts
 * packageTypeOf("/app/courier.config.ts"); // → "module", for /app/package.json of type module
 * ```
 */
export function packageTypeOf(file: string): unknown {
  for (let directory = dirname(file); ; directory = dirname(directory)) {
    const manifest = join(directory, "package.json");
    if (existsSync(manifest)) return readPackageType(manifest);
    if (dirname(directory) === directory) return undefined;
  }
}

/* A package.json that does not parse declares no type, as the loader reads it. */
function readPackageType(manifest: string): unknown {
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
    return typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "type") : undefined;
  } catch (error) {
    log.debug(`${manifest} could not be read; its package is taken for CommonJS`, error);
    return undefined;
  }
}
