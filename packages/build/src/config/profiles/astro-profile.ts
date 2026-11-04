/**
 * Astro, as its server writes `astro:env/server` and `astro:env/client`:
 * the variables of the environment, and `getSecret` beside them. Astro
 * coerces each variable to the type its `env.schema` declares and fills in
 * its default; the schema is in `astro.config`, which is not run to read
 * the project, so here every variable is the string the environment holds,
 * and one it does not hold is `undefined`.
 */

import { environmentView } from "./environment-view";
import type { ModuleRule } from "./resolution-profile";

const everyVariable = (): boolean => true;

/** What Astro's server answers for its environment modules. */
export const ASTRO_MODULES: ReadonlyMap<string, ModuleRule> = new Map<string, ModuleRule>([
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
