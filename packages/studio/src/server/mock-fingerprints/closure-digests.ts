import { dirname } from "node:path";
import { readPathAliases } from "@noverax/courier-studio-core/config";

import { extractConfigDeps } from "../extract-config-deps";
import { resolveConfigImport } from "../resolve-config-import";
import { sha256Hex } from "../sha256-hex";

/**
 * A digest of what an import of the mocks file runs, by its specifier: the
 * file it resolves to and every module it reaches, each with the hash of its
 * bytes. A package outside the project is named by its specifier alone, as
 * the watcher leaves it too.
 *
 * It is taken anew from the disk at each load, so a module created where the
 * loader would take it is in it as soon as the loader takes it. The paths
 * that are absent are left out: one only stops being absent, without the
 * loader taking anything else — a directory made where a file could be,
 * `src/api/` beside `src/api.ts` — and counting it restarted mocks whose
 * modules had not changed.
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
    const lines = [specifier];
    if (resolved.file !== null) {
      const reached = [...extractConfigDeps([resolved.file])];
      reached.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      for (const [path, hash] of reached) if (hash !== null) lines.push(`${path} ${hash}`);
    }
    const digest = sha256Hex(lines.join("\n"));
    digests.set(specifier, digest);
    return digest;
  };
}
