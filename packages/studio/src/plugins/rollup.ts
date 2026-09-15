import { RESOLVED_ID, VIRTUAL_ID } from "./core/constants";
import { resolveSnippet } from "./core/resolve-snippet";
import type { StudioPluginOptions } from "./core/types";

const FRAMEWORK = "rollup";

/**
 * Rollup plugin for Courier Studio.
 * Injects `attachRuntime("rollup-browser")` into entry modules in dev/watch mode.
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
  let pending: Promise<string | null> | null = null;
  const ensure = (): Promise<string | null> => (pending ??= resolveSnippet(FRAMEWORK, options));

  return {
    name: "courier-studio",

    buildStart() {
      injected = false;
    },

    resolveId(id: string) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      return undefined;
    },

    async load(id: string) {
      if (id !== RESOLVED_ID) return undefined;
      return (await ensure()) ?? "";
    },

    async transform(this: RollupTransformContext, code: string, id: string) {
      if (injected) return undefined;
      if (id.startsWith("\0") || id.includes("node_modules")) return undefined;

      const info = this.getModuleInfo(id);
      if (!info?.isEntry) return undefined;

      const snippet = await ensure();
      if (!snippet) return undefined;

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
  load(id: string): Promise<string | undefined>;
  transform(
    this: RollupTransformContext,
    code: string,
    id: string,
  ): Promise<{ code: string; map: null } | undefined>;
}
