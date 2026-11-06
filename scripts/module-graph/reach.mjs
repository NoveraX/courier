import { readFileSync } from "node:fs";

import { computedImportsOf, importsOf } from "./imports-of.mjs";
import { resolveImport } from "./resolve-import.mjs";

/**
 * Every module a published module reaches, through what it imports and
 * what those import in turn, as a page's bundler resolves them — a package
 * of the workspace named by its name too, through its `exports` — before
 * any of them is dropped as unused, which is the bundler's to decide.
 *
 * @param {typeof import("typescript")} ts - The TypeScript compiler, whose scanner reads the imports
 * @param {string} entry - The entry module's file
 * @param {import("./resolve-import.mjs").Package[]} packages - The workspace's packages a page's code may reach, by name too
 * @returns {{ parents: Map<string, string | null>, builtins: { name: string, importer: string }[], foreign: { name: string, importer: string }[], missing: { reason: string, importer: string }[], computed: { kind: string, line: number, pattern?: true, module: string }[] }}
 *   Each module reached, by the module it was first reached from; the built-in modules of Node, and the packages outside the workspace, reached; the imports that lead nowhere; the calls that import by a name no bundler can tell, or by a pattern
 * @example
 * const { parents } = reachedFrom(ts, "/pkg/lib/client/index.js", packages);
 */
export function reachedFrom(ts, entry, packages) {
  const parents = new Map([[entry, null]]);
  const builtins = [];
  const foreign = [];
  const missing = [];
  const computed = [];
  const queue = [entry];
  while (queue.length > 0) {
    const importer = queue.shift();
    const code = readFileSync(importer, "utf8");
    for (const call of computedImportsOf(ts, code)) computed.push({ ...call, module: importer });
    for (const specifier of importsOf(ts, code)) {
      const found = resolveImport(specifier, importer, packages);
      if (found.kind === "builtin") builtins.push({ name: found.name, importer });
      if (found.kind === "package") foreign.push({ name: found.name, importer });
      if (found.kind === "missing") missing.push({ reason: found.reason, importer });
      if (found.kind !== "module" || parents.has(found.path)) continue;
      parents.set(found.path, importer);
      queue.push(found.path);
    }
  }
  return { parents, builtins, foreign, missing, computed };
}

/**
 * The way from the entry to a module it reaches, each step the module
 * that first imported the next.
 *
 * @param {Map<string, string | null>} parents - What `reachedFrom` found
 * @param {string} module - The module reached
 * @returns {string[]} The modules from the entry to `module`
 * @example
 * chainTo(new Map([["a", null], ["b", "a"]]), "b"); // ["a", "b"]
 */
export function chainTo(parents, module) {
  const chain = [];
  for (let at = module; at !== null && at !== undefined; at = parents.get(at) ?? null) {
    chain.unshift(at);
  }
  return chain;
}
