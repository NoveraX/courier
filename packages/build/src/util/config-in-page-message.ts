import { basename } from "node:path";

/**
 * Why the project's config cannot be a module of a page, and what to write
 * instead. It holds the server's settings and the definition of every API —
 * their addresses, their middleware, what reads their secrets — and imported
 * as a value it ships all of them to the browser. A page needs its type
 * alone, which an `import type` gives without a byte of it.
 *
 * @param configFile - The project's config
 * @returns The message a build fails with
 * @example
 * ```ts
 * configInPageMessage("/app/courier.config.ts"); // "[courier] courier.config.ts is imported into a page as a value, …"
 * ```
 */
export function configInPageMessage(configFile: string): string {
  return `[courier] ${basename(configFile)} is imported into a page as a value, which would ship the server's settings and every API's definition to the browser. Import its type alone: write \`import type config from\` where the page writes \`import config from\`.`;
}
