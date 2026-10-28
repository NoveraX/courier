import type { RoutesSnapshot } from "./routes-snapshot";

/**
 * The module a page's bundle takes in place of `@noverax/courier/routes`:
 * the routes of every source of the config, as data alone.
 *
 * @param snapshot - The routes as the config gave them
 * @returns The module's code
 * @example
 * ```ts
 * routesModuleCode(snapshot); // 'export const routes = {"shop":{"source":"shop","endpoints":{…}}};\n'
 * ```
 */
export function routesModuleCode(snapshot: RoutesSnapshot): string {
  return `export const routes = ${JSON.stringify(snapshot.routes)};\n`;
}

/**
 * The module a page's bundle takes when the routes were never read: one
 * that fails where it is imported, saying why, as a build fails with it.
 * It still exports `routes`, so a module that imports it links, and the
 * reason is the error the page shows.
 *
 * @param message - Why the routes were not read
 * @returns The module's code
 * @example
 * ```ts
 * unreadRoutesModuleCode("courier.config.ts did not load: …");
 * ```
 */
export function unreadRoutesModuleCode(message: string): string {
  return `throw new Error(${JSON.stringify(`[courier] ${message}`)});\nexport const routes = {};\n`;
}
