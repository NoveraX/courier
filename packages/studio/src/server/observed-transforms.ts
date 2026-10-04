import type { TransformCache } from "@noverax/courier-studio-core/config";
import { sha256Hex } from "./sha256-hex";

/** A transform cache that notes what each module a load evaluated held. */
export interface ObservedTransforms {
  /** The cache the load transforms through. */
  cache: TransformCache;
  /** Each module the load evaluated, by path, with the hash of its text; see {@link evaluatedTextHash}. */
  evaluated: ReadonlyMap<string, string>;
}

/**
 * Note what each module a load evaluates holds, as the loader reads it to
 * evaluate it: the loader hands every module it transpiles to the transform,
 * the config and the mocks file included, with the text it read. A module
 * Node runs itself — JSON, a native JavaScript module — is not transpiled,
 * and so not noted.
 *
 * @param inner - The cache the load transforms through
 * @returns The cache to load with, and what it notes
 * @example
 * ```ts
 * const observed = observedTransforms(studioTransformCache(root));
 * await evaluateCourierFiles(configFile, mocksFile, observed.cache);
 * observed.evaluated.get(configFile); // → "3f2a…"
 * ```
 */
export function observedTransforms(inner: TransformCache): ObservedTransforms {
  const evaluated = new Map<string, string>();
  return {
    evaluated,
    cache: {
      transform(options, compute) {
        if (options.filename !== undefined) {
          evaluated.set(options.filename, evaluatedTextHash(options.source));
        }
        return inner.transform(options, compute);
      },
    },
  };
}

/**
 * The hash of a module's text as the loader evaluates it: the SHA-256 of
 * its UTF-8 bytes. For a file whose bytes are UTF-8, the hash of its bytes.
 *
 * @param text - The module's text
 * @returns The hash, in hex
 * @example
 * ```ts
 * evaluatedTextHash("export default {}"); // → sha256Hex of those bytes
 * ```
 */
export function evaluatedTextHash(text: string): string {
  return sha256Hex(Buffer.from(text, "utf8"));
}
