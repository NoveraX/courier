import { startDevToolsServer } from "./core/auto-start";
import { resolveOptions } from "./core/options";
import { generateConnectSnippet } from "./core/snippet";
import type { DevToolsPluginOptions } from "./core/types";

/**
 * Astro integration for Nexus DevTools.
 * Auto-injects `connectDevTools()` into pages in dev mode.
 *
 * @example
 * ```ts
 * // astro.config.mjs
 * import { nexusDevTools } from "@noverax/nexus-devtools/astro"
 *
 * export default defineConfig({
 *   integrations: [nexusDevTools()],
 * })
 * ```
 */
export function nexusDevTools(options?: DevToolsPluginOptions): AstroIntegrationLike {
  const resolved = resolveOptions(options);

  return {
    name: "nexus-devtools",
    hooks: {
      "astro:config:setup"(ctx: AstroSetupContext) {
        if (ctx.command !== "dev" || !resolved.enabled) return;

        if (resolved.autoStart) {
          startDevToolsServer(resolved);
        }

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
