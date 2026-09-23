import { getSources, registerSources, studioHooks } from "@noverax/courier";
import type { AnySource } from "@noverax/courier/define";

import { findMatchingSourceKey, resolveNewSourceKey } from "./source-resolution";

const HOOKS_INSTALLED_KEY = Symbol.for("courier.studio.attach-runtime-source-defined-installed");

/**
 * Install the `studioHooks.onSourceDefined` listener exactly once per
 * process. The listener merges new `defineApi()` results into the global
 * sources registry on the fly — needed both in dev (HMR replays) and in
 * production (rare but valid for runtimes that build sources lazily).
 *
 * Pinned to `globalThis` via `Symbol.for` so module duplication across
 * Turbopack / webpack chunks does not split the install state.
 */
export function installSourceDefinedHook(): void {
  const g = globalThis as Record<symbol, unknown>;
  if (g[HOOKS_INSTALLED_KEY]) return;
  g[HOOKS_INSTALLED_KEY] = true;

  studioHooks.onSourceDefined = (newSource: unknown, baseURL: string) => {
    const current = getSources() ?? {};
    const src = newSource as AnySource;

    if (baseURL) {
      const key = findMatchingSourceKey(current, src, baseURL);
      if (key) {
        current[key] = src;
        registerSources({ ...current });
        return;
      }
    }

    current[resolveNewSourceKey(current, src)] = src;
    registerSources({ ...current });
  };
}

/** Undo `installSourceDefinedHook` — for tests only. */
export function uninstallSourceDefinedHook(): void {
  const g = globalThis as Record<symbol, unknown>;
  g[HOOKS_INSTALLED_KEY] = false;
  studioHooks.onSourceDefined = undefined;
}
