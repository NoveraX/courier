import { statSync } from "node:fs";
import { basename, sep } from "node:path";
import type { RoutesInputs } from "@noverax/courier-build";

import type { RoutesAsset, RoutesTransformContext } from "./routes-asset";
import { routesEngineOf } from "./routes-engine-of";

/* The names a config may have: the module that holds them is matched by them in .parcelrc too. */
const CONFIG_NAME = /^courier\.config\.[cm]?[jt]s$/;

/**
 * Transform an asset Parcel hands the transformer: the module
 * `@noverax/courier/routes` ships becomes the routes read from the project's
 * config, and the config itself, in a bundle a browser runs, fails it.
 *
 * Every path the routes came from, and every variable the config looked
 * at, is handed to Parcel, whose cache then keeps the module only while
 * none has changed. A build fails while the routes cannot be read; a dev
 * server keeps those it read last, and warns why.
 *
 * @param asset - The asset
 * @param context - Parcel's options and logger, and where the config is
 * @returns The asset, transformed
 * @throws Error on the config, in a browser's bundle, and when the routes cannot be read in a build
 * @example
 * ```ts
 * new Transformer({ transform: ({ asset, options, logger }) => transformRoutesAsset(asset, { options, logger }) });
 * ```
 */
export async function transformRoutesAsset<TAsset extends RoutesAsset>(
  asset: TAsset,
  context: RoutesTransformContext,
): Promise<TAsset[]> {
  const { routesModuleCode, RoutesReadError, configInPageMessage } = await import(
    "@noverax/courier-build"
  );
  if (CONFIG_NAME.test(basename(asset.filePath))) {
    if (asset.env.isBrowser()) throw new Error(configInPageMessage(asset.filePath));
    return [asset];
  }
  const engine = await routesEngineOf(process.cwd(), context.config);
  try {
    const snapshot = await engine.read();
    follow(asset, snapshot);
    asset.setCode(routesModuleCode(snapshot));
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    const read = failure instanceof RoutesReadError ? failure.inputs : undefined;
    const followed = read ?? engine.last;
    if (followed !== undefined) follow(asset, followed);
    const last = engine.last;
    if (context.options.mode === "production" || last === undefined) throw failure;
    context.logger.warn({ message: `[courier] ${failure.message}` });
    asset.setCode(routesModuleCode(last));
  }
  asset.type = "js";
  return [asset];
}

/* A config that went through every variable is read again whenever Parcel starts. */
function follow(asset: RoutesAsset, inputs: RoutesInputs): void {
  for (const filePath of inputs.files) {
    if (isThere(filePath)) asset.invalidateOnFileChange(filePath);
    else asset.invalidateOnFileCreate({ filePath });
  }
  for (const folder of inputs.listed ?? []) {
    asset.invalidateOnFileCreate({ glob: `${folder.split(sep).join("/")}/*` });
  }
  if (inputs.env === "*") asset.invalidateOnStartup();
  else for (const name of inputs.env) asset.invalidateOnEnvChange(name);
}

function isThere(path: string): boolean {
  try {
    return statSync(path, { throwIfNoEntry: false }) !== undefined;
  } catch {
    return true;
  }
}
