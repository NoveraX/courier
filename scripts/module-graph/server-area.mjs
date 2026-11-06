/**
 * The area a published module of the core lies in when only a server
 * runs it: a folder whose modules all are a server's, or a module of its
 * own.
 *
 * @param {string} module - The module's path under `lib/`, as `adapter/limits.js`
 * @param {string[]} areas - The server's areas: folders ending in `/`, modules by their path
 * @returns {string | undefined} The area, or `undefined` for a module a page may run
 * @example
 * serverAreaOf("adapter/create-handler.js", ["adapter/", "node.js"]); // "adapter/"
 * serverAreaOf("client/proxy.js", ["adapter/", "node.js"]); // undefined
 */
export function serverAreaOf(module, areas) {
  return areas.find((area) => (area.endsWith("/") ? module.startsWith(area) : module === area));
}
