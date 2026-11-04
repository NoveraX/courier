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
import type { ModuleRule } from "./resolution-profile";

const PUBLIC_PREFIX = "PUBLIC_";

const isPublic = (name: string): boolean => name.startsWith(PUBLIC_PREFIX);
const isPrivate = (name: string): boolean => !isPublic(name);

/** What SvelteKit's server answers for its environment modules. */
export const SVELTEKIT_MODULES: ReadonlyMap<string, ModuleRule> = new Map<string, ModuleRule>([
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
