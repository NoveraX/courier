import { readFileSync } from "node:fs";

/* What esbuild's define makes of each global of Node: a name no code holds of its own, so a
   reference to the global is told apart from a binding of the module's own, from a property and
   from text. */
const MARK = "__nodeGlobal_";
const NODE_GLOBALS = [
  "Buffer",
  "global",
  "__dirname",
  "__filename",
  "setImmediate",
  "clearImmediate",
  "process",
];
const DEFINE = Object.fromEntries(NODE_GLOBALS.map((name) => [name, `${MARK}${name}`]));
const REFERENCE = new RegExp(`\\b${MARK}(\\w+)(\\s*\\??\\.\\s*env\\b)?`, "g");

/* A module of the workspace, built: its package's folder and its path under the package. */
const WORKSPACE_MODULE = /\/(?:packages|node_modules\/@noverax)\/([^/]+\/lib\/.+\.m?js)$/;

/* What each module read refers to, by its file: the scenarios take the same modules again. */
const read = new Map();

function globalsOf(esbuild, file) {
  let found = read.get(file);
  if (found === undefined) {
    const { code } = esbuild.transformSync(readFileSync(file, "utf8"), {
      define: DEFINE,
      loader: "js",
      format: "esm",
      logLevel: "silent",
    });
    const names = [...code.matchAll(REFERENCE)]
      .filter(([, name, env]) => name !== "process" || env === undefined)
      .map(([, name]) => name);
    found = [...new Set(names)];
    read.set(file, found);
  }
  return found;
}

/**
 * The globals of Node that the workspace's modules a build took name
 * freely, which no browser has and which Parcel answers with a polyfill —
 * a read off `globalThis`, the way a page asks for one safely, is none:
 * `Buffer`, `global`, `__dirname`, `__filename`, `setImmediate`,
 * `clearImmediate`, and `process` but for a read of `process.env`, which
 * bundlers replace. A check for the global counts as a use: Parcel takes
 * even `typeof Buffer` for one, and brings in a polyfill the app has not
 * installed.
 *
 * @param {import("esbuild")} esbuild - What reads each module, telling a global from the module's own names
 * @param {string[]} files - The files the build took, in any chunk, as its bundler names them
 * @returns {{ module: string, global: string }[]} One entry per module and global
 * @example
 * nodeGlobalReads(esbuild, ["/repo/packages/core/lib/a.js"]); // [{ module: "core/lib/a.js", global: "Buffer" }]
 */
export function nodeGlobalReads(esbuild, files) {
  const reads = [];
  for (const file of new Set(files)) {
    const module = WORKSPACE_MODULE.exec(`/${file.split("\\").join("/")}`)?.[1];
    if (module === undefined) continue;
    for (const name of globalsOf(esbuild, file)) reads.push({ module, global: name });
  }
  return reads;
}
