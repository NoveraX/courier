import { rmSync } from "node:fs";
import { join } from "node:path";
import {
  type CourierRoutesOptions,
  type RoutesRsbuildApi,
  courierRoutes as routesPlugin,
} from "@noverax/courier-build/rsbuild";

export type { CourierRoutesOptions };

/* What a build names a page's scripts by, which the plugin has the dev server name them by too. */
const BY_CONTENT = "[name].[contenthash:10].js";

/** An environment's config, as far as the plugin reads and changes it. */
export interface ScriptsConfig {
  output: { target?: string; filename?: { js?: unknown }; filenameHash?: unknown };
  dev?: { writeToDisk?: unknown };
}

/** An Rspack config, as far as the plugin adds to it. */
export interface PluginsConfig {
  module?: { rules?: unknown[] } | undefined;
  plugins?: unknown[] | undefined;
  output?: { clean?: unknown } | undefined;
}

/** What of Rsbuild's plugin API the plugin uses. */
export interface StartRsbuildApi extends RoutesRsbuildApi {
  readonly context: RoutesRsbuildApi["context"] & { readonly action?: string };
  modifyEnvironmentConfig(modify: (config: ScriptsConfig) => void): void;
  modifyRspackConfig(
    modify: (
      config: PluginsConfig,
      utils: {
        readonly isServer: boolean;
        readonly environment: { readonly config: ScriptsConfig };
      },
    ) => void,
  ): void;
}

/** An Rsbuild plugin, as Rsbuild takes it in `plugins`. */
export interface StartRsbuildPlugin {
  readonly name: string;
  setup(api: StartRsbuildApi): void;
}

/* A dev build's compiler, as far as the plugin reads what it wrote. */
interface EmittingCompiler {
  readonly outputPath: string;
  readonly hooks: {
    readonly afterEmit: { tap(name: string, hook: (compilation: EmittedBuild) => void): void };
  };
}

interface EmittedBuild {
  readonly hash?: string | null | undefined;
  readonly errors: readonly unknown[];
  getAssets(): ReadonlyArray<{ readonly name: string }>;
}

/* Forget on disk, as Rsbuild does in memory, the files of a dev server that writes them there under
   names by their content: each one neither the last build nor the one before it wrote, for a page a
   build behind. */
function forgetOnDisk(): { apply(compiler: EmittingCompiler): void } {
  return {
    apply(compiler) {
      const lastSeen = new Map<string, number>();
      let build = 0;
      let lastHash: string | null | undefined;
      compiler.hooks.afterEmit.tap("courier-routes:forget-on-disk", (compilation) => {
        if (compilation.errors.length > 0) return;
        if (compilation.hash !== lastHash) {
          build += 1;
          lastHash = compilation.hash;
        }
        for (const { name } of compilation.getAssets()) {
          lastSeen.set(join(compiler.outputPath, name.split("?")[0] ?? name), build);
        }
        for (const [file, seen] of lastSeen) {
          if (seen >= build - 1) continue;
          lastSeen.delete(file);
          rmSync(file, { force: true });
        }
      });
    },
  };
}

/**
 * The Rsbuild plugin that builds a TanStack Start app's routes — what each
 * page's proxy client may call — from `courier.config.ts`, for an app
 * TanStack Start builds with Rsbuild: its pages and the server that
 * renders them. No routes file is written, and a page that imports the
 * config itself fails the build.
 *
 * Under the dev server it names the scripts of a page by their content, as
 * a build does, unless the app names them itself or turns the hash in names
 * off. A TanStack Start page
 * preloads its scripts as modules, and an engine may run a preloaded module
 * again from its memory, whatever the response says — WebKit does, on a
 * reload too: under a name that never changes, a page loaded after an edit
 * would run the routes from before it. A dev server that writes its files
 * to disk keeps there those of the last two builds alone, as it keeps them
 * in memory.
 *
 * @param options - Where the config is, when it is not found from the project's root
 * @returns The plugin
 * @example
 * ```ts
 * // rsbuild.config.ts
 * import { courierRoutes } from "@noverax/courier-tanstack-start/rsbuild";
 * import { defineConfig } from "@rsbuild/core";
 * import { pluginReact } from "@rsbuild/plugin-react";
 * import { tanstackStart } from "@tanstack/react-start/plugin/rsbuild";
 *
 * export default defineConfig({ plugins: [pluginReact(), tanstackStart(), courierRoutes()] });
 * ```
 */
export function courierRoutes(options: CourierRoutesOptions = {}): StartRsbuildPlugin {
  const routes = routesPlugin(options);
  return {
    name: routes.name,
    setup(api) {
      routes.setup(api);
      /* Rsbuild knows it serves rather than builds only once it starts. */
      api.modifyEnvironmentConfig(({ output }) => {
        if (api.context.action !== "dev" || output.target !== "web") return;
        if (output.filename?.js !== undefined || output.filenameHash === false) return;
        output.filename = { ...output.filename, js: BY_CONTENT };
      });
      api.modifyRspackConfig((config, { environment }) => {
        const { dev, output } = environment.config;
        if (api.context.action !== "dev" || output.filename?.js !== BY_CONTENT) return;
        if (dev?.writeToDisk === undefined || dev.writeToDisk === false) return;
        if (config.output?.clean) return;
        config.plugins = [...(config.plugins ?? []), forgetOnDisk()];
      });
    },
  };
}
