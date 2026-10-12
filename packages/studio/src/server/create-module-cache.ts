import { normalize } from "node:path";
import type { CourierModuleCache } from "./load-courier-entry";

/**
 * An empty module cache for one load, which finds a module by any name of
 * its file.
 *
 * The loader keys its cache by the name it resolved a file to, and on
 * Windows it names one file two ways: with forward slashes where it resolves
 * an import itself, with backslashes where Node resolves it — as for
 * `./courier.config.js` written for `courier.config.ts`. Two imports of the
 * file would each run it, and a mocks file would serve a source object the
 * config does not hold. Each name is kept as the system writes it, so every
 * name of a file finds the one module.
 *
 * @returns The cache, empty
 * @example
 * ```ts
 * const cache = createModuleCache();
 * await loadCourierEntry(configFile, cache, transformCache);
 * ```
 */
export function createModuleCache(): CourierModuleCache {
  return new Proxy<CourierModuleCache>(
    {},
    {
      get: (target, key) => Reflect.get(target, named(key)),
      set: (target, key, value: unknown) => Reflect.set(target, named(key), value),
      has: (target, key) => Reflect.has(target, named(key)),
      deleteProperty: (target, key) => Reflect.deleteProperty(target, named(key)),
      defineProperty: (target, key, descriptor) =>
        Reflect.defineProperty(target, named(key), descriptor),
      getOwnPropertyDescriptor: (target, key) =>
        Reflect.getOwnPropertyDescriptor(target, named(key)),
    },
  );
}

function named(key: string | symbol): string | symbol {
  return typeof key === "string" ? normalize(key) : key;
}
