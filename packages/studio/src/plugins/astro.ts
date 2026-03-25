import { resolveOptions } from "./core/options";
import { generateConnectSnippet } from "./core/snippet";
import type { StudioPluginOptions } from "./core/types";

/**
 * Astro integration for Nexus Studio.
 * Auto-injects `connectStudio()` into pages in dev mode.
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
  const resolved = resolveOptions(options);

  return {
    name: "nexus-studio",
    hooks: {
      "astro:config:setup"(ctx: AstroSetupContext) {
        if (ctx.command !== "dev" || !resolved.enabled) return;
        ctx.injectScript("page-init", generateConnectSnippet(resolved));
      },
    },
  };
}

// Minimal Astro types to avoid astro dependency
interface AstroSetupContext {
  command: "dev" | "build" | "preview";
  injectScript: (stage: string, content: string) => void;
}

interface AstroIntegrationLike {
  name: string;
  hooks: Record<string, (ctx: AstroSetupContext) => void>;
}
