import { RESOLVED_ID, VIRTUAL_ID } from "./core/constants";
import { resolveOptions } from "./core/options";
import { generateConnectSnippet } from "./core/snippet";
import type { StudioPluginOptions } from "./core/types";

/**
 * Rollup plugin for Nexus Studio.
 * Injects `connectStudio()` into entry modules in dev/watch mode.
 *
 * @example
 * ```ts
 * import { nexusStudio } from "@noverax/nexus-studio/rollup"
 *
 * export default {
 *   plugins: [nexusStudio()],
 * }
 * ```
 */
export function nexusStudio(options?: StudioPluginOptions): RollupPluginLike {
  const resolved = resolveOptions(options);
  let injected = false;

  return {
    name: "nexus-studio",

    buildStart() {
      injected = false;
    },

    resolveId(id: string) {
      if (!resolved.enabled) return undefined;
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      return undefined;
    },

    load(id: string) {
      if (!resolved.enabled) return undefined;
      if (id === RESOLVED_ID) return generateConnectSnippet(resolved);
      return undefined;
    },

    transform(this: RollupTransformContext, code: string, id: string) {
      if (!resolved.enabled || injected) return undefined;
      if (id.startsWith("\0") || id.includes("node_modules")) return undefined;

      const info = this.getModuleInfo(id);
      if (!info?.isEntry) return undefined;

      injected = true;
      return { code: `import "${VIRTUAL_ID}"\n${code}`, map: null };
    },
  };
}

interface RollupTransformContext {
  getModuleInfo(id: string): { isEntry: boolean } | null;
}

interface RollupPluginLike {
  name: string;
  buildStart(): void;
  resolveId(id: string): string | undefined;
  load(id: string): string | undefined;
  transform(
    this: RollupTransformContext,
    code: string,
    id: string,
  ): { code: string; map: null } | undefined;
}
