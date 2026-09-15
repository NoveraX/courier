import { resolveSnippet } from "./core/resolve-snippet";
import type { StudioPluginOptions } from "./core/types";

const FRAMEWORK = "astro";

/**
 * Astro integration for Nexus Studio.
 * Auto-injects `attachRuntime("astro-browser")` into pages in dev mode.
 *
 * @example
 * ```ts
 * // astro.config.mjs
 * import { nexusStudio } from "@noverax/nexus-studio/astro"
 *
 * export default defineConfig({
 *   integrations: [nexusStudio()],
 * })
 * ```
 */
export function nexusStudio(options?: StudioPluginOptions): AstroIntegrationLike {
  return {
    name: "nexus-studio",
    hooks: {
      async "astro:config:setup"(ctx: AstroSetupContext) {
        if (ctx.command !== "dev") return;
        const snippet = await resolveSnippet(FRAMEWORK, options);
        if (!snippet) return;
        ctx.injectScript("page-init", snippet);
      },
    },
  };
}

interface AstroSetupContext {
  command: "dev" | "build" | "preview";
  injectScript: (stage: string, content: string) => void;
}

interface AstroIntegrationLike {
  name: string;
  hooks: Record<string, (ctx: AstroSetupContext) => void | Promise<void>>;
}
