import { sidesTaken } from "./sides-taken.mjs";

/**
 * What a server or an app takes of the core, where no page runs: the root,
 * which offers both sides, and the server's entry, which alone takes what
 * only a server's own code calls — so each module only a server runs is
 * reached by the one or the other.
 */
export const SERVER_TAKES = {
  name: "the core's root and /server",
  code: 'export * from "@noverax/courier";\nexport * as server from "@noverax/courier/server";',
};

/**
 * What a build of {@link SERVER_TAKES} for a server or an app breaches: a
 * module only a server runs taken as its browser stand-in, or not taken.
 *
 * @param {string} runtime - The runtime the build is for, as a breach names it
 * @param {string[]} inputs - The build's inputs, as esbuild's metafile names them
 * @param {string[]} serverOnly - The paths under `lib/` of the modules only a server runs
 * @returns {string[]} Each breach
 * @example
 * runtimeSideBreaches("Node", Object.keys(result.metafile.inputs), ["logger/server.js"]); // []
 */
export function runtimeSideBreaches(runtime, inputs, serverOnly) {
  const { server, browser } = sidesTaken(inputs, serverOnly);
  const missing = serverOnly.filter((module) => !server.includes(module));
  return [
    ...browser.map((module) => `${runtime} takes the browser's ${module} in place of the server's`),
    ...missing.map((module) => `${runtime} does not take the server's ${module}`),
  ];
}
