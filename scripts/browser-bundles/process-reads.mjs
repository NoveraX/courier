/**
 * What a build's `define` makes of the global `process`: esbuild renames the
 * global alone, so a read of it is told apart from a `process` of the code's
 * own, from `globalThis.process` and from text.
 */
export const GLOBAL_PROCESS = "__globalProcess";

const READ = new RegExp(`\\b${GLOBAL_PROCESS}\\s*\\??\\.\\s*([\\w$]+)`, "g");

/**
 * The Node APIs a bundle reads off the global `process` — anything but
 * `process.env`. Next.js's build of a middleware, which runs in its edge
 * runtime, refuses such a read or warns of it, whether or not the module
 * checks for the API first: code an edge runtime may take reads one off
 * `globalThis.process`, checking for it.
 *
 * @param {string} text - The bundle, unminified, its modules marked as esbuild marks them,
 *   built with the global `process` defined as {@link GLOBAL_PROCESS}
 * @returns {{ module: string, api: string }[]} One entry per module and API
 * @example
 * processReads(`// packages/core/lib/a.js\nconst v = ${GLOBAL_PROCESS}.versions;`); // [{ module: "core/lib/a.js", api: "process.versions" }]
 */
export function processReads(text) {
  const found = [];
  for (const part of text.split(/^\/\/ (?=\S+\.m?js$)/m)) {
    const module = (part.split("\n", 1)[0] ?? "").replace(/^.*?packages\//, "");
    const code = part.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");
    const apis = [...code.matchAll(READ)].map((read) => read[1]).filter((api) => api !== "env");
    for (const api of new Set(apis)) found.push({ module, api: `process.${api}` });
  }
  return found;
}
