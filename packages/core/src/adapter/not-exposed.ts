import { createLogger } from "../logger";
import { isDevelopment } from "../utils/development";

const log = createLogger("Proxy");

/* Each endpoint is named once: a page that keeps calling it says nothing new. */
const named = new Set<string>();

/**
 * Say, while developing, that a page called an endpoint nothing marks for
 * it — most likely one the developer meant to mark, or a routes module
 * written before its mark was taken off. The caller is answered as for a
 * name the source does not define either way; only the server's own log
 * says why, and only outside production, so a caller guessing names learns
 * nothing from it.
 *
 * @param endpoint - The endpoint as the refusal names it: `[api][admin][purge]`
 * @example
 * ```ts
 * if (!isExposedToWire(dataSource, group, schema)) warnNotExposed(`[${source}][${group}][${method}]`);
 * ```
 */
export function warnNotExposed(endpoint: string): void {
  if (!isDevelopment() || named.has(endpoint)) return;
  named.add(endpoint);
  log.warn(
    `${endpoint}: a page called it, and nothing marks it .expose(), so the proxy answered as for an unknown name. Mark it where it is defined if a page may call it, and write the routes again.`,
  );
}
