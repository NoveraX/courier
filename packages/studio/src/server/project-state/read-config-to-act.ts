import type { LoadedCourierConfig } from "../config-loader";
import { ACT_BUDGET_MS } from "./budgets";
import { ProjectUnavailableError } from "./project-unavailable-error";
import type { ProjectReads } from "./types";

/**
 * Read the config Studio runs, for a route that writes files where its
 * declarations say or cleans up there: only once Studio has caught up with
 * the saves on disk, and only while that config loads as it is on disk,
 * because files written from a stale or missing declaration land in, or
 * clean up, the wrong directory.
 *
 * @param project - The project Studio runs
 * @param root - The project root, symlinks resolved
 * @returns The config Studio runs, current with the disk
 * @throws {ProjectUnavailableError} 503 `STUDIO_STARTING` before the first
 *   outcome, 503 `CONFIG_RELOADING` while a load is still under way, 409
 *   `CONFIG_MISSING` without a config, 409 `CONFIG_NOT_LOADING` while it fails
 *
 * @example
 * ```ts
 * const loaded = await readConfigToAct(project, root);
 * loaded.config.imports?.pets; // → the declaration the write acts on
 * ```
 */
export async function readConfigToAct(
  project: ProjectReads,
  root: string,
): Promise<LoadedCourierConfig> {
  const view = await project.fresh(ACT_BUDGET_MS);
  if (view.starting) throw ProjectUnavailableError.starting();
  if (view.settling) throw ProjectUnavailableError.reloading();
  const { failure } = view;
  if (failure?.code === "CONFIG_NOT_FOUND") throw ProjectUnavailableError.missing(root);
  if (failure) throw ProjectUnavailableError.notLoading(failure);
  /* An outcome with no failure always ran a config; this only keeps the types honest. */
  if (view.running === null) throw ProjectUnavailableError.starting();
  return view.running;
}
