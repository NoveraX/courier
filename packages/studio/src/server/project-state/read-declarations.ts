import type { ImportDeclarations } from "../imports-bridge";
import { SHOW_BUDGET_MS } from "./budgets";
import { ProjectUnavailableError } from "./project-unavailable-error";
import { readConfigToAct } from "./read-config-to-act";
import type { FreshSnapshot, ProjectReads } from "./types";

/**
 * What a route does with the import declarations it reads.
 *
 * - `show` — describes them: a list, a preview, a check for updates.
 * - `forget` — drops an import Studio wrote; only removing one.
 * - `act` — writes generated files where they say, or cleans up there.
 */
export type DeclarationsPurpose = "show" | "forget" | "act";

/**
 * Read the `imports` of courier.config as Studio runs it, once Studio has
 * caught up with the saves already on disk. Nothing is loaded for the
 * request: a save not yet loaded is loaded for everyone, on the reload chain.
 *
 * What each purpose gets:
 *
 * | State | `show` | `forget` | `act` |
 * |---|---|---|---|
 * | loaded | current | current | current |
 * | fails, loaded before | last good | last good | 409 `CONFIG_NOT_LOADING` |
 * | fails, never loaded | 409 `CONFIG_NOT_LOADING` | `{}` | 409 `CONFIG_NOT_LOADING` |
 * | missing | last good, or `{}` | last good, or `{}` | 409 `CONFIG_MISSING` |
 * | no outcome yet | 503 `STUDIO_STARTING` | 503 `STUDIO_STARTING` | 503 `STUDIO_STARTING` |
 * | still reloading | current | current | 503 `CONFIG_RELOADING` |
 *
 * `show` and `forget` wait `SHOW_BUDGET_MS` at most: a list a moment old is
 * better than one left waiting. `act` waits `ACT_BUDGET_MS`, and acts only on
 * a config that loads as it is on disk, because files written from a stale
 * or missing declaration land in, or clean up, the wrong directory. Removing
 * an import never depends on the config loading: that is how a user undoes
 * an import the config cannot load with.
 *
 * @param project - The project Studio runs
 * @param root - The project root, symlinks resolved
 * @param purpose - What the route does with the declarations
 * @returns The declarations, by import name
 * @throws {ProjectUnavailableError} When the purpose cannot be served now, as above
 *
 * @example
 * ```ts
 * const declarations = await readDeclarations(project, root, "show");
 * summarizeImports(importsSnapshotOf(declarations, root));
 * ```
 */
export async function readDeclarations(
  project: ProjectReads,
  root: string,
  purpose: DeclarationsPurpose,
): Promise<ImportDeclarations> {
  if (purpose === "act") return (await readConfigToAct(project, root)).config.imports ?? {};
  return toShow(await project.fresh(SHOW_BUDGET_MS), purpose);
}

function toShow(view: FreshSnapshot, purpose: "show" | "forget"): ImportDeclarations {
  if (view.starting) throw ProjectUnavailableError.starting();
  if (view.running) return view.running.config.imports ?? {};
  const { failure } = view;
  if (failure === null || failure.code === "CONFIG_NOT_FOUND" || purpose === "forget") return {};
  throw ProjectUnavailableError.notLoading(failure);
}
