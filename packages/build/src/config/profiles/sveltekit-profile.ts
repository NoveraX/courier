/**
 * SvelteKit, as its server writes the modules it answers itself: `$env/*`
 * from the environment, split by the public prefix as SvelteKit splits it,
 * and `$app/environment` as it reads while SvelteKit analyses the server
 * during a build — not in a browser, building, in development unless
 * `NODE_ENV` says production. Reading definitions is that case: the server's
 * modules run, and no request is served.
 *
 * The prefix is SvelteKit's default, `PUBLIC_`: one set in `svelte.config.js`
 * is not read, as that would run another of the project's files.
 */

import { environmentView } from "./environment-view";
import type { Diagnosis, FrameworkRules, ModuleRule } from "./resolution-profile";

const PUBLIC_PREFIX = "PUBLIC_";

const isPublic = (name: string): boolean => name.startsWith(PUBLIC_PREFIX);
const isPrivate = (name: string): boolean => !isPublic(name);

/** What SvelteKit's server answers for its environment modules. */
const MODULES: ReadonlyMap<string, ModuleRule> = new Map<string, ModuleRule>([
  ["$env/static/private", { kind: "provided", exports: () => environmentView(isPrivate) }],
  ["$env/static/public", { kind: "provided", exports: () => environmentView(isPublic) }],
  [
    "$env/dynamic/private",
    { kind: "provided", exports: () => Object.freeze({ env: environmentView(isPrivate) }) },
  ],
  [
    "$env/dynamic/public",
    { kind: "provided", exports: () => Object.freeze({ env: environmentView(isPublic) }) },
  ],
  [
    "$app/environment",
    {
      kind: "provided",
      exports: () =>
        Object.freeze({
          browser: false,
          building: true,
          dev: process.env.NODE_ENV !== "production",
          version: "",
        }),
    },
  ],
]);

/* SvelteKit's runtime modules, which only its server has; and $lib, which svelte-kit sync writes. */
function unresolved(specifier: string): Diagnosis | undefined {
  if (specifier === "$lib" || specifier.startsWith("$lib/")) {
    return {
      reason:
        "is SvelteKit's alias for src/lib, which svelte-kit sync writes into .svelte-kit/tsconfig.json",
      remedy:
        "Run `npx svelte-kit sync` before Courier reads the project — in CI, once the packages are installed",
    };
  }
  if (!specifier.startsWith("$app/") && specifier !== "$service-worker") return undefined;
  return {
    reason: "is a module of SvelteKit's runtime, which only SvelteKit's server has",
    remedy:
      "Import it where a request is served — a load function, an endpoint, a hook — and keep it out of the modules courier.config imports, which may read $env/* and $app/environment",
  };
}

/** What SvelteKit's server answers for its environment modules, and says of its runtime ones. */
export const SVELTEKIT_RULES: FrameworkRules = { modules: MODULES, unresolved };
