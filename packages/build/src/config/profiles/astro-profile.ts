/**
 * Astro, as its server writes `astro:env/server` and `astro:env/client`:
 * the variables of the environment, and `getSecret` beside them. Astro
 * coerces each variable to the type its `env.schema` declares and fills in
 * its default; the schema is in `astro.config`, which is not run to read
 * the project, so here every variable is the string the environment holds,
 * and one it does not hold is `undefined`.
 */

import { environmentView } from "./environment-view";
import type { FrameworkRules, ModuleRule } from "./resolution-profile";

const everyVariable = (): boolean => true;

/** What Astro's server answers for its environment modules. */
const MODULES: ReadonlyMap<string, ModuleRule> = new Map<string, ModuleRule>([
  [
    "astro:env/server",
    {
      kind: "provided",
      exports: () =>
        environmentView(everyVariable, {
          getSecret: (name: string): string | undefined => process.env[name],
        }),
    },
  ],
  ["astro:env/client", { kind: "provided", exports: () => environmentView(everyVariable) }],
]);

/** What Astro's server answers for its environment modules, and says of its other virtual ones. */
export const ASTRO_RULES: FrameworkRules = {
  modules: MODULES,
  unresolved: (specifier) =>
    specifier.startsWith("astro:")
      ? {
          reason: "is a module of Astro's runtime, which only Astro's build has",
          remedy:
            "Import it from a page, an endpoint or a middleware, and keep it out of the modules courier.config imports, which may read astro:env/server and astro:env/client",
        }
      : undefined,
};
