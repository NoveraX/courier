import { basename } from "node:path";
import type { PluginBuild } from "esbuild";

import { CONFIG_BASENAMES } from "../config/config-candidates";
import { configFileOf } from "../util/config-file-of";
import { configInPageMessage } from "../util/config-in-page-message";

/**
 * Fail a page's bundle where it takes the project's config as a module: it
 * would ship the server's settings and every API's definition to the
 * browser. esbuild is handed only the file names a config may have, so every
 * other module loads without a call to the plugin; the config itself is
 * found anew, as it may appear or move while a context watches.
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
  const filter = new RegExp(`(^|[\\\\/])(${names.map(escaped).join("|")})$`);
  build.onLoad({ filter, namespace: "file" }, (args) => {
    const configFile = configFileOf(root, named);
    if (configFile === undefined || withSlashes(args.path) !== withSlashes(configFile)) {
      return undefined;
    }
    return { errors: [{ text: configInPageMessage(configFile) }] };
  });
}

function escaped(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function withSlashes(path: string): string {
  return path.split("\\").join("/");
}
