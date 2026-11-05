import { isAbsolute, relative, sep } from "node:path";

import type { ModuleCache, NodeModule } from "jiti";

/**
 * The modules a load ran from its entry to the one that failed, read off the
 * module cache the loader filled: each module it ran is there, with the
 * modules it imported as its `children`, and `loaded` set once it ran to its
 * end. The failure is in the deepest module that has not: every module above
 * it waits on its import. A module whose failure an importer caught ended
 * too, so the newest unfinished child is followed.
 *
 * @param cache - The load's module cache
 * @param entry - The entry's key in it, as the loader registered it
 * @param failed - The file of the module that failed, where the error names it
 * @returns The modules' files, the entry first; only the entry when the cache holds no more
 * @example
 * ```ts
 * importChain(cache, "/app/courier.config.ts");
 * // → ["/app/courier.config.ts", "/app/src/api.ts", "/app/src/server/db.ts"]
 * ```
 */
export function importChain(cache: ModuleCache, entry: string, failed?: string): string[] {
  const root = cache[entry];
  if (root === undefined) return [entry];
  const towardFailed = failed === undefined ? undefined : pathTo(root, failed);
  if (towardFailed !== undefined) return towardFailed;
  const chain = [root.filename];
  const seen = new Set<NodeModule>([root]);
  for (let current = root; ; ) {
    const next = current.children.findLast((child) => !child.loaded && !seen.has(child));
    if (next === undefined) return chain;
    seen.add(next);
    chain.push(next.filename);
    current = next;
  }
}

/**
 * A chain as a line names it: each module by its path from the project's
 * folder, a package by its name.
 *
 * @param chain - The chain, as `importChain` gives it, a package appended by name
 * @param folder - The project's folder, absolute
 * @returns `courier.config.ts → src/api.ts → src/server/db.ts`
 * @example
 * ```ts
 * shownChain(["/app/courier.config.ts", "/app/src/api.ts"], "/app"); // "courier.config.ts → src/api.ts"
 * ```
 */
export function shownChain(chain: readonly string[], folder: string): string {
  return chain.map((link) => shownModule(link, folder)).join(" → ");
}

/**
 * A module as a line names it: a file of the project by its path from the
 * project's folder, an installed package's by the package's name.
 *
 * @param link - A module's file, absolute, or a package's name
 * @param folder - The project's folder, absolute
 * @returns The name
 * @example
 * ```ts
 * shownModule("/app/node_modules/@acme/ui/index.js", "/app"); // "@acme/ui"
 * ```
 */
export function shownModule(link: string, folder: string): string {
  if (!isAbsolute(link)) return link;
  return packageOfFile(link, folder) ?? relative(folder, link).split(sep).join("/");
}

/**
 * The installed package a file belongs to: the name after its last
 * `node_modules`, with its scope. Only the part of the path below the
 * project's folder counts, so a project that is itself kept under a
 * `node_modules` folder — a cache, a test's — is no package; a file above
 * the folder, a package installed further up a workspace, counts whole.
 *
 * @param file - The file, absolute
 * @param folder - The project's folder, absolute
 * @returns The package's name, or `undefined` for a file of no package
 * @example
 * ```ts
 * packageOfFile("/app/node_modules/@clerk/nextjs/dist/esm/server/index.js", "/app"); // "@clerk/nextjs"
 * ```
 */
export function packageOfFile(file: string, folder: string): string | undefined {
  const below = relative(folder, file);
  const parts = (below.startsWith("..") || isAbsolute(below) ? file : below).split(/[\\/]/);
  const at = parts.lastIndexOf("node_modules");
  if (at === -1) return undefined;
  const [first, second] = parts.slice(at + 1);
  if (first === undefined) return undefined;
  return first.startsWith("@") && second !== undefined ? `${first}/${second}` : first;
}

/* The path from a module to one whose file is `failed`, through what each imported: the shortest. */
function pathTo(root: NodeModule, failed: string): string[] | undefined {
  const queue: Array<{ module: NodeModule; chain: string[] }> = [
    { module: root, chain: [root.filename] },
  ];
  const seen = new Set<NodeModule>([root]);
  for (let at = 0; at < queue.length; at += 1) {
    const step = queue[at];
    if (step === undefined) break;
    if (step.module.filename === failed) return step.chain;
    for (const child of step.module.children) {
      if (seen.has(child)) continue;
      seen.add(child);
      queue.push({ module: child, chain: [...step.chain, child.filename] });
    }
  }
  return undefined;
}
