/**
 * Nuxt, whose server answers no import Courier can stand in for: its
 * aliases (`#imports`, `#app`, `#build`) and the composables it imports into
 * every module are written by its build, from the modules and the plugins
 * the project uses, and are honestly reproduced by nothing but that build.
 * Definitions must not depend on them; a load that fails on one says so.
 */

import type { Diagnosis, FrameworkRules } from "./resolution-profile";

/* The aliases Nuxt's build resolves, as the project's modules import them. */
const NUXT_ALIASES = [
  "#imports",
  "#app",
  "#build",
  "#components",
  "#head",
  "#vue-router",
  "#internal",
];

const RUNTIME_REMEDY =
  "Import what the definitions need from its own package — ofetch, h3, defu — or call the runtime inside a function that runs for a request, such as an endpoint's middleware";

function unresolved(specifier: string): Diagnosis | undefined {
  if (specifier === "~" || specifier.startsWith("~/") || specifier.startsWith("~~/")) {
    return {
      reason:
        "is Nuxt's alias for the project's source folder, which nuxi prepare writes into .nuxt/tsconfig.json",
      remedy:
        "Run `npx nuxi prepare` before Courier reads the project — in CI, once the packages are installed",
    };
  }
  const alias = NUXT_ALIASES.some((name) => specifier === name || specifier.startsWith(`${name}/`));
  if (!alias) return undefined;
  return {
    reason:
      "is one of Nuxt's aliases, which only Nuxt's build resolves: definitions must not depend on Nuxt's runtime",
    remedy: RUNTIME_REMEDY,
  };
}

/** What Nuxt says of its aliases and its auto-imports outside its build. */
export const NUXT_RULES: FrameworkRules = {
  modules: new Map(),
  unresolved,
  undefinedName: () => ({
    reason:
      "is not defined outside Nuxt: where it is one of the composables or utilities Nuxt imports for you, definitions must not depend on Nuxt's runtime",
    remedy: RUNTIME_REMEDY,
  }),
};
