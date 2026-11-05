import type { FrameworkId, FrameworkMarker } from "../frameworks";
import { ASTRO_RULES } from "./astro-profile";
import { NEXT_RULES } from "./next-profile";
import { NUXT_RULES } from "./nuxt-profile";
import type { FrameworkRules, ResolutionProfile } from "./resolution-profile";
import { SVELTEKIT_RULES } from "./sveltekit-profile";

/* The frameworks whose server answers imports of its own, or says why it cannot here. */
const RULES: Partial<Record<FrameworkId, FrameworkRules>> = {
  next: NEXT_RULES,
  nuxt: NUXT_RULES,
  sveltekit: SVELTEKIT_RULES,
  astro: ASTRO_RULES,
};

const NONE: FrameworkRules = { modules: new Map() };

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
  return { framework, ...((framework && RULES[framework.id]) ?? NONE) };
}

/**
 * The framework whose own import a specifier is, among those Courier
 * answers or explains, for a project read as another: `$env/static/private`
 * is SvelteKit's.
 *
 * @param specifier - The import, as written
 * @returns The framework's id, or `undefined` when the import is none of theirs
 * @example
 * ```ts
 * frameworkOfImport("server-only"); // "next"
 * ```
 */
export function frameworkOfImport(specifier: string): FrameworkId | undefined {
  const owners = Object.entries(RULES) as Array<[FrameworkId, FrameworkRules]>;
  return owners.find(
    ([, rules]) => rules.modules.has(specifier) || rules.unresolved?.(specifier) !== undefined,
  )?.[0];
}
