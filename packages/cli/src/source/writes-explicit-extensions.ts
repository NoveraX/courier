import { readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { createLogger } from "@noverax/courier";
import { importsCarryExtensions } from "./imports-carry-extensions";
import { packageTypeOf } from "./package-type-of";
import { parseSource } from "./parse-source";
import { usesNodeResolution } from "./uses-node-resolution";

const log = createLogger("Project");

/* Files that are ES modules whatever their package says, and those whose
   package's `type` decides, as TypeScript tells them apart. */
const ALWAYS_ES_MODULE: ReadonlySet<string> = new Set([".mts", ".mjs"]);
const BY_PACKAGE_TYPE: ReadonlySet<string> = new Set([".ts", ".tsx", ".js", ".jsx"]);

/**
 * Whether the project names the file of a relative import with the
 * extension it runs as, so a new import of the config is written that way:
 * the file the import goes into — the mocks file, or the routes module — is
 * an ES module whose imports TypeScript may resolve as Node does — a
 * tsconfig at or above its folder, or a project it references, of `node16`
 * or `nodenext` resolution, and a `.mts` file or a `.ts` one in a package of
 * type module — or the config's own relative imports end in `.js` or `.mjs`.
 *
 * @param root - The project root, symlinks resolved
 * @param fileName - The file's path from the root, whether it exists or is to be created
 * @param configName - The config's name in the root
 * @returns `true` when a relative import the edit adds should carry its extension
 * @example
 * ```ts
 * // package.json: { "type": "module" }; tsconfig.json: { "compilerOptions": { "module": "NodeNext" } }
 * writesExplicitExtensions(root, "courier.mocks.ts", "courier.config.ts"); // → true
 * ```
 */
export function writesExplicitExtensions(
  root: string,
  fileName: string,
  configName: string,
): boolean {
  const file = join(root, fileName);
  if (isEsModule(file) && usesNodeResolution(dirname(file))) return true;
  return configCarriesExtensions(join(root, configName));
}

function isEsModule(file: string): boolean {
  const extension = extname(file);
  if (ALWAYS_ES_MODULE.has(extension)) return true;
  return BY_PACKAGE_TYPE.has(extension) && packageTypeOf(file) === "module";
}

/* A config that cannot be read shows no convention; the load reports it. */
function configCarriesExtensions(file: string): boolean {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    log.debug(`Could not read ${file} for how it writes relative imports`, err);
    return false;
  }
  return importsCarryExtensions(parseSource(file, text).program);
}
