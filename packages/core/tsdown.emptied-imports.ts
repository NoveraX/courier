import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TsdownPlugin } from "tsdown";

/**
 * Drop each import of one of the package's own modules that binds no name,
 * in a package that declares that its modules do nothing as they load.
 *
 * The build writes a constant of another module in place where it is
 * used — the separator of a group's path, a part's default type — and
 * keeps the import it came through, with no name left to bind:
 * `import "../define/group-tree.js"`. In a package so declared, such an
 * import does nothing: an app's bundler drops it, and esbuild warns of
 * each where the package lies outside `node_modules`. One a source writes,
 * the build drops itself. An import of another package is left as it is:
 * what that package's modules do as they load is its own.
 *
 * @returns The plugin
 * @throws {Error} As the build starts, where the package's manifest does not declare that its modules do nothing as they load
 * @example
 * ```ts
 * defineConfig({ unbundle: true, plugins: [emptiedImports()] });
 * ```
 */
export function emptiedImports(): TsdownPlugin {
  return {
    name: "courier:emptied-imports",
    buildStart({ cwd }) {
      const path = join(cwd, "package.json");
      const manifest: unknown = JSON.parse(readFileSync(path, "utf8"));
      const declared =
        typeof manifest === "object" && manifest !== null
          ? Reflect.get(manifest, "sideEffects")
          : undefined;
      if (declared !== false) {
        throw new Error(
          `${path} does not declare "sideEffects": false, so an import that binds no name may run a module for what it does`,
        );
      }
    },
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        /* A module whose text holds no such import, however written, is not parsed. */
        if (chunk.type !== "chunk" || !/\bimport\s*["']\./.test(chunk.code)) continue;
        const emptied = this.parse(chunk.code).body.filter(
          (node) =>
            node.type === "ImportDeclaration" &&
            node.specifiers.length === 0 &&
            node.source.value.startsWith("."),
        );
        if (emptied.length === 0) continue;
        let code = "";
        let at = 0;
        for (const node of emptied) {
          code += chunk.code.slice(at, node.start);
          at = chunk.code[node.end] === "\n" ? node.end + 1 : node.end;
        }
        chunk.code = code + chunk.code.slice(at);
      }
    },
  };
}
