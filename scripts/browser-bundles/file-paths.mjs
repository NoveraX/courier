/**
 * A file's path as the checks of a page's bundles compare it: with forward
 * slashes on every system, as esbuild names its inputs everywhere and Vite
 * its modules on Windows too, whatever form a bundler hands it in.
 *
 * @param {string} path - The path, as a bundler named it
 * @returns {string} The path with forward slashes
 * @example
 * slashed("D:\\a\\page.js"); // "D:/a/page.js"
 */
export function slashed(path) {
  return path.split("\\").join("/");
}
