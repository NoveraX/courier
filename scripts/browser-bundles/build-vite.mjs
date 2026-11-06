import { slashed } from "./file-paths.mjs";

/**
 * What a page loads at start when Vite builds it for production: the
 * entry chunk and the chunks it imports statically, minified as Vite
 * minifies them, and the modules they hold. A chunk a dynamic import
 * loads is left for when a call needs it. The modules of every chunk
 * are given too, that one's among them: a page may load any.
 *
 * @param {typeof import("vite")} vite - Vite, as the repository installs it
 * @param {string} entry - The scenario's module
 * @param {string} root - The folder the scenario's module is in
 * @param {readonly string[]} provided - The application's own libraries, left out
 * @returns {Promise<{ code: string, modules: string[], everyModule: string[] }>} The start's code, the files of its modules, and those of every chunk, each with forward slashes
 * @example
 * const { code } = await viteStart(vite, "/work/page.js", "/work", ["react"]);
 */
export async function viteStart(vite, entry, root, provided) {
  const result = await vite.build({
    root,
    configFile: false,
    logLevel: "silent",
    mode: "production",
    build: {
      write: false,
      minify: true,
      modulePreload: false,
      rollupOptions: {
        input: entry,
        external: [...provided],
        preserveEntrySignatures: "exports-only",
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((build) => build.output);
  const chunks = new Map(
    outputs.filter((output) => output.type === "chunk").map((chunk) => [chunk.fileName, chunk]),
  );
  const start = [];
  const visit = (name) => {
    const chunk = chunks.get(name);
    if (chunk === undefined || start.includes(chunk)) return;
    start.push(chunk);
    for (const imported of chunk.imports) visit(imported);
  };
  for (const chunk of chunks.values()) if (chunk.isEntry) visit(chunk.fileName);
  return {
    code: start.map((chunk) => chunk.code).join(""),
    modules: start.flatMap((chunk) => chunk.moduleIds).map(slashed),
    everyModule: [...chunks.values()].flatMap((chunk) => chunk.moduleIds).map(slashed),
  };
}
