import { createRequire } from "node:module";

/** What webpack hands a function in `externals`. */
export interface ExternalRequest {
  /** The directory of the module that imports. */
  context?: string;
  /** What it imports. */
  request?: string;
}

/** How a function in `externals` answers webpack. */
export type ExternalCallback = (error?: Error | null, result?: string) => void;

/**
 * A webpack `externals` function that leaves `ws` out of a Node server bundle
 * and loads it from `node_modules` when the bundle runs.
 *
 * Studio's socket in a server runtime reaches Studio through `ws`. Bundled,
 * `ws` found its optional `bufferutil` replaced by an empty module, took it
 * for the native addon, and threw on every frame of 48 bytes or more — so
 * under `next dev --webpack` the server runtime connected and then never said
 * hello or reported a single request. Loaded as installed, `ws` finds the
 * addon or falls back to its own masking.
 *
 * `ws` is resolved from the module that imports it, as it would be unbundled,
 * so it is found under a package manager that does not hoist it.
 *
 * @param data - The import webpack asks about
 * @param callback - Answered with the external for `ws`, and nothing otherwise
 * @example
 * ```ts
 * webpackConfig.externals = [...webpackConfig.externals, wsExternal];
 * ```
 */
export function wsExternal(
  { context, request }: ExternalRequest,
  callback: ExternalCallback,
): void {
  if (request !== "ws" || context === undefined) {
    callback();
    return;
  }
  let resolved: string;
  try {
    resolved = createRequire(`${context}/`).resolve("ws");
  } catch (error) {
    callback(error instanceof Error ? error : new Error(String(error)));
    return;
  }
  callback(null, `commonjs ${resolved}`);
}
