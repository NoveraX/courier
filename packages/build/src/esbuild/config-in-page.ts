import { basename, extname } from "node:path";
import type { PluginBuild } from "esbuild";

import { CONFIG_BASENAMES } from "../config/config-candidates";
import { configFileOf } from "../util/config-file-of";
import { configInPageMessage } from "../util/config-in-page-message";

/* What marks the plugin's own resolution of an import, which it lets through. */
const RESOLVING = "@noverax/courier-build:resolving-config";

/**
 * Fail a page's bundle where it imports the project's config: it would ship
 * the server's settings and every API's definition to the browser. The
 * import is caught as it resolves, not as the module loads: another plugin
 * may load the file first, as Angular's compiler loads every TypeScript
 * module. esbuild hands the plugin only imports that name a config's file,
 * with or without its extension; each resolves as it would, and the one that
 * reaches the config — found anew, as it may appear or move while a context
 * watches — fails.
 *
 * @param build - The build the plugin is set up for
 * @param root - The project's root, where the config is found from
 * @param named - The config, from the root or absolute, when it is not the one found
 * @example
 * ```ts
 * if (build.initialOptions.platform !== "node") refuseConfigInPage(build, root, options.config);
 * ```
 */
export function refuseConfigInPage(
  build: PluginBuild,
  root: string,
  named: string | undefined,
): void {
  const names = named === undefined ? CONFIG_BASENAMES : [basename(named)];
  const stems = [...new Set(names.map((name) => name.slice(0, -extname(name).length)))];
  const filter = new RegExp(`(^|[\\\\/])(${stems.map(escaped).join("|")})(\\.[cm]?[jt]s)?$`);
  build.onResolve({ filter }, async (args) => {
    if (args.pluginData === RESOLVING) return undefined;
    const resolved = await build.resolve(args.path, {
      kind: args.kind,
      importer: args.importer,
      resolveDir: args.resolveDir,
      pluginData: RESOLVING,
    });
    const configFile = configFileOf(root, named);
    if (resolved.errors.length > 0 || configFile === undefined) return undefined;
    if (withSlashes(resolved.path) !== withSlashes(configFile)) return undefined;
    return { errors: [{ text: configInPageMessage(configFile) }] };
  });
}

function escaped(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function withSlashes(path: string): string {
  return path.split("\\").join("/");
}
