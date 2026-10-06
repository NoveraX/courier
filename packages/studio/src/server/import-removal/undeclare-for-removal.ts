import type { ApisRouteDeps } from "../apis-routes";
import type { UndeclareRequest } from "../config-edit/config-undeclaration-types";
import { runConfigEdit } from "../config-edit/run-config-edit";
import { undeclareAlone } from "../config-edit/undeclare-alone";
import { ConfigUndeclareError } from "./config-undeclare-error";

/**
 * Take an import out of courier.config before its files go, as the remove
 * dialog showed the change. Called with the imports lock held, once the
 * file plan is checked: a config that changed since the preview, or a
 * change Studio could not make, stops the removal before any file goes.
 *
 * @param deps - The project, and its root
 * @param request - The import, the files the removal may take and takes, and the preview's hash
 * @returns The config Studio changed
 * @throws {ConfigUndeclareError} `CONFIG_STALE` or `CONFIG_NOT_CHANGED`; the config is as it was
 * @example
 * ```ts
 * const { configFile } = await undeclareForRemoval(deps, { name, mayTake, taking, baseHash });
 * ```
 */
export async function undeclareForRemoval(
  deps: ApisRouteDeps,
  request: UndeclareRequest,
): Promise<{ configFile: string }> {
  const result = await runConfigEdit(deps.project, (tx) => undeclareAlone(deps, tx, request));
  if (result.status === "applied") return { configFile: result.configFile };
  if (result.status === "stale") {
    throw new ConfigUndeclareError(
      "CONFIG_STALE",
      "courier.config changed since you saw the change to it, so no file was removed. Look at the removal again.",
    );
  }
  throw new ConfigUndeclareError("CONFIG_NOT_CHANGED", `${result.reason} No file was removed.`);
}
