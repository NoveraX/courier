import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The core's modules only a server runs, as the build publishes them: each
 * has a browser stand-in of the same path under `lib/browser/`.
 *
 * @param {string} lib - The core's `lib` directory
 * @returns {string[]} Their paths under `lib/`, as `logger/server.js`
 * @example
 * serverOnlyModules("packages/core/lib"); // ["logger/server.js", "session/validate-forward.js", …]
 */
export function serverOnlyModules(lib) {
  return readdirSync(join(lib, "browser"), { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".js"))
    .map((path) => path.split("\\").join("/"))
    .sort();
}
