import { isRecord } from "../util/is-record";
import type { RoutesSnapshot } from "./routes-snapshot";

/**
 * The module a page's bundle takes in place of `@noverax/courier/routes`:
 * the routes of every source of the config, as data alone, written as an
 * object literal that keeps every name its own — `__proto__` too, which a
 * literal would otherwise take for the object's prototype.
 *
 * @param snapshot - The routes as the config gave them
 * @returns The module's code
 * @example
 * ```ts
 * routesModuleCode(snapshot); // 'export const routes = {"shop":{"source":"shop","endpoints":{…}}};\n'
 * ```
 */
export function routesModuleCode(snapshot: RoutesSnapshot): string {
  return `export const routes = ${literalOf(snapshot.routes)};\n`;
}

/* JSON, but for a key `__proto__`, which only a computed key keeps the object's own. */
function literalOf(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(literalOf).join(",")}]`;
  if (!isRecord(value)) return JSON.stringify(value) ?? "null";
  const members = Object.entries(value).filter(([, member]) => member !== undefined);
  return `{${members.map(([key, member]) => `${keyOf(key)}:${literalOf(member)}`).join(",")}}`;
}

function keyOf(key: string): string {
  return key === "__proto__" ? '["__proto__"]' : JSON.stringify(key);
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
