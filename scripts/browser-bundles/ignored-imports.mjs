/**
 * The imports an esbuild build left out as binding nothing, each of a
 * module whose package declares in `"sideEffects"` that the module does
 * nothing as it loads. Such an import is there for what the module does as
 * it loads, so an app's bundler that drops it drops that too; esbuild warns
 * of each where the importer lies outside `node_modules`, as each of
 * Courier's packages does in the workspace.
 *
 * @param {{ warnings: { id: string, location: { file: string, lineText: string, column: number, length: number } | null }[] }} result - The build's result
 * @returns {{ module: string, imported: string }[]} The module that imports, by its path from its package's folder on, and what it imports, as written
 * @example
 * ignoredImports(esbuild.buildSync({ entryPoints: ["page.js"], bundle: true, write: false }));
 * // [{ module: "core/lib/proxy-caller/from-routes.js", imported: "../define/group-tree.js" }]
 */
export function ignoredImports(result) {
  return result.warnings
    .filter((warning) => warning.id === "ignored-bare-import" && warning.location !== null)
    .map(({ location }) => {
      const quoted = location.lineText.slice(location.column, location.column + location.length);
      return { module: location.file.replace(/^.*?packages\//, ""), imported: quoted.slice(1, -1) };
    });
}
