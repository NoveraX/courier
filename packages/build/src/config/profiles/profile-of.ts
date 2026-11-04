import type { FrameworkId, FrameworkMarker } from "../frameworks";
import { ASTRO_MODULES } from "./astro-profile";
import { NEXT_MODULES } from "./next-profile";
import type { ModuleRule, ResolutionProfile } from "./resolution-profile";
import { SVELTEKIT_MODULES } from "./sveltekit-profile";

/* The frameworks whose server answers imports of its own, each with what it answers. */
const MODULES: Partial<Record<FrameworkId, ReadonlyMap<string, ModuleRule>>> = {
  next: NEXT_MODULES,
  sveltekit: SVELTEKIT_MODULES,
  astro: ASTRO_MODULES,
};

const NONE: ReadonlyMap<string, ModuleRule> = new Map();

/**
 * How a framework's server answers the imports it answers itself. A
 * framework that answers none, and a project that lists no framework, are
 * read as plain Node.
 *
 * @param framework - The project's framework, as its package.json tells it
 * @returns The profile every loader of the project's files applies
 * @example
 * ```ts
 * profileOf(projectFramework(projectRoot).framework).modules.has("server-only"); // true for Next.js
 * ```
 */
export function profileOf(framework: FrameworkMarker | undefined): ResolutionProfile {
  return { framework, modules: (framework && MODULES[framework.id]) ?? NONE };
}
