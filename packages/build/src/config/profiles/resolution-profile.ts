/**
 * What a framework's own server hands a project's modules for the imports it
 * answers itself — Next's `server-only`, SvelteKit's `$env/static/private`,
 * Astro's `astro:env/server` — so a config that reaches them loads outside
 * that framework's build, as it does inside it.
 *
 * A framework resolves these where it builds the server, never through
 * Node: Next aliases `server-only` to an empty module on its server layers,
 * SvelteKit and Astro write the env modules from the environment. A loader
 * that resolves imports as Node does cannot find them, so a project whose
 * API modules mark themselves as server code, or read their settings the
 * framework's way, would not load at all. A profile says what each such
 * import is outside the build, and every loader of project files applies it.
 */

import type { FrameworkMarker } from "../frameworks";

/** What a module of the project gets for an import its framework's server answers itself. */
export type ModuleRule =
  /** A module with nothing in it: a marker of server code, which is where definitions run. */
  | { readonly kind: "empty" }
  /** A module whose exports are made for each load that imports it: the framework's view of the environment. */
  | { readonly kind: "provided"; readonly exports: () => object }
  /** A module definitions must not reach: importing it fails the load, saying why and what to do. */
  | { readonly kind: "refused"; readonly reason: string; readonly remedy: string };

/** How a framework's server answers imports outside its build. */
export interface ResolutionProfile {
  /** The framework; `undefined` for a project read as plain Node. */
  readonly framework: FrameworkMarker | undefined;
  /** The imports the framework's server answers itself, by specifier. */
  readonly modules: ReadonlyMap<string, ModuleRule>;
}
