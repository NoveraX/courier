import { readFileSync } from "node:fs";
import { createLogger } from "@noverax/courier";
import { isRecord } from "./is-record";
import { parseJsonc } from "./parse-jsonc";

const log = createLogger("Studio");

/**
 * Read a tsconfig as TypeScript does, comments and trailing commas allowed,
 * without TypeScript, which a project need not have.
 *
 * @param file - The tsconfig's path
 * @returns Its top-level object; `null` when it cannot be read or parsed, which is logged at debug level
 * @example
 * ```ts
 * // /app/tsconfig.json: { "compilerOptions": { "module": "NodeNext" } }
 * readTsconfig("/app/tsconfig.json"); // → { compilerOptions: { module: "NodeNext" } }
 * ```
 */
export function readTsconfig(file: string): Record<string, unknown> | null {
  try {
    const config = parseJsonc(readFileSync(file, "utf8"));
    return isRecord(config) ? config : null;
  } catch (err) {
    log.debug(`Could not read ${file}, so the module options it sets are not known`, err);
    return null;
  }
}
