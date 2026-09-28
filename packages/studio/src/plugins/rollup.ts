import { RESOLVED_ID, RUNTIME_SPECIFIER, VIRTUAL_ID } from "./core/constants";
import { entryPathsOf } from "./core/entry-paths";
import { resolveSnippet } from "./core/resolve-snippet";
import { RUNTIME_IMPORTER } from "./core/runtime-importer";
import type { StudioPluginOptions } from "./core/types";

const FRAMEWORK = "rollup";

/**
 * Rollup plugin for Courier Studio.
 *
 * Injects `attachRuntime("rollup-browser")` into the entry modules of a watch
 * build, as `rollup -c -w` runs one. Rollup has no mode, so a one-off build —
 * `rollup -c` — is taken for a production build and left untouched.
 *
 * @param options - `enabled` forces injection on or off; by default it is on
 *   in watch mode unless `NODE_ENV` is `"production"`.
 * @returns The Rollup plugin.
 *
 * @example
 * ```ts
 * import { courierStudio } from "@noverax/courier-studio/rollup"
 *
 * export default {
 *   plugins: [courierStudio()],
 * }
 * ```
 */
export function courierStudio(options?: StudioPluginOptions): RollupPluginLike {
  let injected = false;
  let entries = new Set<string>();
  let pending: Promise<string | null> = Promise.resolve(null);

  return {
    name: "courier-studio",

    buildStart(this: RollupBuildContext, inputOptions: { input: unknown }) {
      injected = false;
      entries = entryPathsOf(inputOptions.input);
      const development = this.meta.watchMode;
      pending = resolveSnippet({ framework: FRAMEWORK, options, development });
    },

    resolveId(this: RollupResolveContext, id: string, importer?: string) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      if (importer === RESOLVED_ID && id === RUNTIME_SPECIFIER) {
        return this.resolve(id, RUNTIME_IMPORTER, { skipSelf: true });
      }
      return undefined;
    },

    async load(id: string) {
      if (id !== RESOLVED_ID) return undefined;
      return (await pending) ?? "";
    },

    async transform(this: RollupTransformContext, code: string, id: string) {
      if (injected) return undefined;
      if (id.startsWith("\0") || id.includes("node_modules")) return undefined;
      if (!entries.has(id) && !this.getModuleInfo(id)?.isEntry) return undefined;

      const snippet = await pending;
      if (!snippet) return undefined;

      injected = true;
      return { code: `import "${VIRTUAL_ID}"\n${code}`, map: null };
    },
  };
}

interface RollupBuildContext {
  meta: { watchMode: boolean };
}

interface RollupTransformContext {
  getModuleInfo(id: string): { isEntry: boolean } | null;
}

interface RollupResolveContext {
  resolve(
    source: string,
    importer: string,
    options: { skipSelf: boolean },
  ): Promise<{ id: string } | null>;
}

interface RollupPluginLike {
  name: string;
  buildStart(this: RollupBuildContext, inputOptions: { input: unknown }): void;
  resolveId(
    this: RollupResolveContext,
    id: string,
    importer?: string,
  ): string | undefined | Promise<{ id: string } | null>;
  load(id: string): Promise<string | undefined>;
  transform(
    this: RollupTransformContext,
    code: string,
    id: string,
  ): Promise<{ code: string; map: null } | undefined>;
}
