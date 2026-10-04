import type { Hono } from "hono";
import type { MockStore } from "../store";
import {
  createStorePersistence,
  type StorePersistence,
  type StorePersistOptions,
} from "../store/store-persistence";

/**
 * Keep a server's store in its `persist` file: saved shortly after every
 * request the app answers, a request that failed to answer included, since
 * it may have changed the store before it failed.
 *
 * @param app - The server's app, before any route is added to it
 * @param store - The server's store
 * @param options - The `persist` option, if any
 * @returns The persistence the server starts and stops, or `undefined` without a file
 * @example
 * ```ts
 * const persistence = persistedStore(app, store, { file: ".courier/mocks/users.json" });
 * ```
 */
export function persistedStore(
  app: Hono,
  store: MockStore,
  options: StorePersistOptions | undefined,
): StorePersistence | undefined {
  if (options === undefined) return undefined;
  const persistence = createStorePersistence(store, options);
  app.use("*", async (_c, next) => {
    try {
      await next();
    } finally {
      persistence.schedule();
    }
  });
  return persistence;
}
