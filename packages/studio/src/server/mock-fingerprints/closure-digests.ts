import { dirname } from "node:path";
import { readPathAliases } from "@noverax/courier-studio-core/config";

import { extractConfigDeps } from "../extract-config-deps";
import { sha256Hex } from "../file-hash";
import { resolveConfigImport } from "../resolve-config-import";

/**
 * A digest of what an import of the mocks file runs, by its specifier: every
 * module it reaches, each with the hash of its bytes, and every absent path
 * where a module created would be the one it runs. A package outside the
 * project is named by its specifier alone, as the watcher leaves it too.
 *
 * Each specifier is resolved and walked once per call of the returned
 * function's maker, so a mocks file whose mocks share a module walks it once.
 *
 * @param mocksFile - The mocks file, whose directory the imports resolve from
 * @returns The digest of the modules one specifier reaches
 * @example
 * ```ts
 * const digestOf = createClosureDigests("/app/courier.mocks.ts");
 * digestOf("./src/api"); // changes whenever src/api.ts or a module it imports does
 * ```
 */
export function createClosureDigests(mocksFile: string): (specifier: string) => string {
  const fromDir = dirname(mocksFile);
  const aliases = readPathAliases(fromDir);
  const digests = new Map<string, string>();
  return (specifier) => {
    const known = digests.get(specifier);
    if (known !== undefined) return known;
    const resolved = resolveConfigImport(fromDir, specifier, aliases);
    const lines = [specifier, ...resolved.absent.map((path) => `absent ${path}`)];
    if (resolved.file !== null) {
      const reached = [...extractConfigDeps([resolved.file])];
      reached.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      for (const [path, hash] of reached) lines.push(`${path} ${hash ?? "absent"}`);
    }
    const digest = sha256Hex(lines.join("\n"));
    digests.set(specifier, digest);
    return digest;
  };
}
