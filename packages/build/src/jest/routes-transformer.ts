import { createHash } from "node:crypto";

import type { CourierRoutesOptions } from "../util/courier-routes-options";
import { readRoutesSync } from "./read-routes-sync";
import type { RoutesThreadReply } from "./routes-thread-messages";

/** What Jest hands a transformer of a module: the part the routes transformer reads. */
export interface RoutesTransformOptions {
  readonly config: { readonly rootDir: string };
  /** Whether the test runs as an ES module, under `--experimental-vm-modules`. */
  readonly supportsStaticESM: boolean;
}

/** The transformer Jest runs on the module `@noverax/courier/routes` ships. */
export interface RoutesTransformer {
  readonly canInstrument: false;
  getCacheKey(source: string, path: string, options: RoutesTransformOptions): string;
  process(source: string, path: string, options: RoutesTransformOptions): { code: string };
}

/**
 * The Jest transformer that builds the routes a proxy client may call from
 * `courier.config.ts`, in place of the module `@noverax/courier/routes`
 * ships, as CommonJS or as an ES module, as the test runs. The config is
 * read in a process of its own, as every bundler's plugin reads it, from
 * Jest's `rootDir`, once in each worker while nothing it read changes; the
 * cache key is the module itself, so a run after an edit, or under another
 * value of a variable the config read, never takes the routes of the last.
 *
 * @param options - Where the config is, when it is not found from `rootDir`
 * @returns The transformer
 * @throws Error from each method when the routes cannot be read, with why
 * @example
 * ```js
 * // jest.config.js
 * export default {
 *   transform: { "/node_modules/@noverax/courier/lib/routes/index\\.js$": "@noverax/courier-build/jest" },
 *   transformIgnorePatterns: ["/node_modules/(?!@noverax/courier/)"],
 * };
 * ```
 */
export function createTransformer(options: CourierRoutesOptions = {}): RoutesTransformer {
  const moduleFor = (transformOptions: RoutesTransformOptions): string => {
    const reply = readRoutesSync({ root: transformOptions.config.rootDir, config: options.config });
    return codeOf(reply, transformOptions.supportsStaticESM);
  };
  return {
    canInstrument: false,
    getCacheKey: (_source, _path, transformOptions) =>
      createHash("sha256").update(moduleFor(transformOptions)).digest("hex"),
    process: (_source, _path, transformOptions) => ({ code: moduleFor(transformOptions) }),
  };
}

function codeOf(reply: RoutesThreadReply, esm: boolean): string {
  if (!reply.ok) throw new Error(`[courier] ${reply.message}`);
  return esm ? reply.module : reply.commonJs;
}
