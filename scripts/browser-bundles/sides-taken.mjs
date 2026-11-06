/* Where the core's published modules sit: in the workspace, or installed. */
const CORE_LIB = /\/(?:packages\/core|node_modules\/@noverax\/courier)\/lib\//;

/**
 * The core's published modules a build took, by their path under `lib/`.
 *
 * @param {string[]} inputs - The build's inputs, as its bundler names them
 * @returns {string[]} Those of the core, as `adapter/limits.js`
 * @example
 * publishedModules(["node_modules/@noverax/courier/lib/client/index.js", "page.js"]); // ["client/index.js"]
 */
export function publishedModules(inputs) {
  return inputs
    .map((input) => `/${input.split("\\").join("/")}`)
    .flatMap((path) => {
      const match = CORE_LIB.exec(path);
      return match ? [path.slice(match.index + match[0].length)] : [];
    });
}

/**
 * Which server-only modules a build took as they are, and which it took
 * as their browser stand-ins.
 *
 * @param {string[]} inputs - The build's inputs, as esbuild's metafile names them
 * @param {string[]} modules - The server-only modules' paths under `lib/`
 * @returns {{ server: string[], browser: string[] }} The modules each way brought
 * @example
 * sidesTaken(["packages/core/lib/browser/logger/server.js"], ["logger/server.js"]); // { server: [], browser: ["logger/server.js"] }
 */
export function sidesTaken(inputs, modules) {
  const published = publishedModules(inputs);
  return {
    server: modules.filter((module) => published.includes(module)),
    browser: modules.filter((module) => published.includes(`browser/${module}`)),
  };
}
