/* Where the core's published modules sit: in the workspace, or installed. */
const CORE_LIB = /\/(?:packages\/core|node_modules\/@noverax\/courier)\/lib\//;

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
  const published = inputs
    .map((input) => `/${input.split("\\").join("/")}`)
    .flatMap((path) => {
      const match = CORE_LIB.exec(path);
      return match ? [path.slice(match.index + match[0].length)] : [];
    });
  return {
    server: modules.filter((module) => published.includes(module)),
    browser: modules.filter((module) => published.includes(`browser/${module}`)),
  };
}
