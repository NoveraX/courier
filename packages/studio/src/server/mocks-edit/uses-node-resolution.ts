import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { isRecord } from "./is-record";
import { readTsconfig } from "./read-tsconfig";
import type { ModuleOptions } from "./tsconfig-module-options";
import { tsconfigModuleOptions } from "./tsconfig-module-options";

/* Lower case, as TypeScript reads either option in any letter case. */
const NODE_RESOLUTIONS: ReadonlySet<string> = new Set(["node16", "nodenext"]);
/* Each `module` that implies one of them while `moduleResolution` is unset. */
const NODE_MODULES: ReadonlySet<string> = new Set(["node16", "node18", "node20", "nodenext"]);

/**
 * Whether TypeScript may resolve the imports of files in a directory as Node
 * does, where a relative import in an ES module must name the file it loads
 * with its extension: the nearest `tsconfig.json` at or above it, with the
 * configs it extends, sets `moduleResolution` to `node16` or `nodenext`, or
 * leaves it unset under a `module` of `node16`, `node18`, `node20` or
 * `nodenext` — or a project it lists under `references` does.
 *
 * A tsconfig that lists `references`, as a solution's does beside
 * `files: []`, leaves a file to the referenced project that includes it, so
 * that project's resolution is the one the file is checked under. One
 * resolving as Node is enough: a specifier that names the file's `.js`
 * resolves under every other resolution too.
 *
 * The tsconfigs are read without TypeScript, which a project need not have.
 * A config that cannot be read or parsed sets nothing.
 *
 * @param directory - The directory of the file whose imports are resolved
 * @returns `true` for Node's resolution; `false` for another, or when no tsconfig sets one
 * @example
 * ```ts
 * // /app/tsconfig.json: { "compilerOptions": { "module": "NodeNext" } }
 * usesNodeResolution("/app"); // → true
 * // /web/tsconfig.json: { "files": [], "references": [{ "path": "./tsconfig.node.json" }] }
 * // /web/tsconfig.node.json: { "compilerOptions": { "module": "NodeNext" } }
 * usesNodeResolution("/web"); // → true
 * ```
 */
export function usesNodeResolution(directory: string): boolean {
  const tsconfig = nearestTsconfig(resolve(directory));
  return tsconfig !== null && resolvesAsNode(tsconfig, new Set());
}

function nearestTsconfig(directory: string): string | null {
  for (let dir = directory; ; dir = dirname(dir)) {
    const candidate = resolve(dir, "tsconfig.json");
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

/* A referenced project's own `references` count too, as a solution may
   list another; `references` are not inherited through `extends`. */
function resolvesAsNode(file: string, visited: Set<string>): boolean {
  if (visited.has(file)) return false;
  visited.add(file);
  const config = readTsconfig(file);
  if (config === null) return false;
  if (isNodeResolution(tsconfigModuleOptions(file, config))) return true;
  return referencesOf(config, dirname(file)).some((reference) =>
    resolvesAsNode(reference, visited),
  );
}

function isNodeResolution({ module, moduleResolution }: ModuleOptions): boolean {
  if (moduleResolution !== undefined) return NODE_RESOLUTIONS.has(moduleResolution.toLowerCase());
  return module !== undefined && NODE_MODULES.has(module.toLowerCase());
}

/* A reference's `path` names a tsconfig when it ends in `.json`, and
   otherwise the directory holding its `tsconfig.json`, as TypeScript reads it. */
function referencesOf(config: Record<string, unknown>, fromDir: string): string[] {
  const { references } = config;
  if (!Array.isArray(references)) return [];
  const items: unknown[] = references;
  return items.flatMap((reference) => {
    if (!isRecord(reference) || typeof reference.path !== "string") return [];
    const target = resolve(fromDir, reference.path);
    return [target.endsWith(".json") ? target : resolve(target, "tsconfig.json")];
  });
}
