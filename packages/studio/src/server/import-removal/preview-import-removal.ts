import type { ApisRouteDeps } from "../apis-routes";
import type { UndeclarePreview } from "../config-edit/config-undeclaration-types";
import {
  type PreparedUndeclaration,
  prepareConfigUndeclaration,
} from "../config-edit/prepare-config-undeclaration";
import { undeclarePreviewOf } from "../config-edit/undeclare-preview-of";
import { type PlanSummary, summarizePlan } from "../import-files/plan-summary";
import { importsSnapshotOf } from "../imports-bridge";
import { projectRootAt } from "../project-fs/project-root";
import { readForRemoval } from "../project-state/read-for-removal";
import { type RemovalConfigNotes, removalConfigNotes } from "../removal-config-notes";
import { planImportRemoval } from "../removal-plan";
import { mayTake } from "./may-take";

/** What removing an import would do, as the remove dialog shows it. */
export interface RemovalPreview extends RemovalConfigNotes {
  /** The files that go, wait for the user, or stay. */
  plan: PlanSummary;
  /** The change that takes the import out of the config; `null` where the config does not declare it. */
  config: UndeclarePreview | null;
}

const NOT_LOADED =
  "courier.config does not load as it is on disk, so Studio leaves it as it is. Remove those lines by hand.";

const NOT_LOCAL =
  "Studio changes courier.config only for a browser on this machine. Remove those lines by hand, or open Studio on the machine it runs on.";

/**
 * Preview removing an import: its file plan, what the config still says
 * about it, and the change that takes it out of the config. That change is
 * offered only while the config loads, and shown only to a browser on this
 * machine; otherwise the dialog says to make it by hand.
 *
 * @param deps - The project, and its root
 * @param name - The import
 * @param local - Whether the request came from a browser on this machine
 * @returns The preview, or the error and status for an import Studio does not know
 * @example
 * ```ts
 * res.json(await previewImportRemoval(deps, "pets", isLocalBrowser(req)));
 * ```
 */
export async function previewImportRemoval(
  deps: ApisRouteDeps,
  name: string,
  local: boolean,
): Promise<RemovalPreview | { error: string; status: number }> {
  const { project, projectRoot } = deps;
  const { imports, running } = await readForRemoval(project, projectRoot);
  const planned = planImportRemoval(
    projectRootAt(projectRoot),
    name,
    importsSnapshotOf(imports, projectRoot),
  );
  if ("error" in planned) return planned;
  const paths = mayTake(planned);
  const notes = removalConfigNotes(projectRoot, name, running, paths);
  const prepared = running && prepareConfigUndeclaration(name, running, projectRoot, paths);
  const loads = project.snapshot().failure === null;
  return { plan: summarizePlan(planned), ...notes, config: shown(prepared, loads, local) };
}

/* The change as this caller may see it: planned against a config that loads, for a page on this machine. */
function shown(
  prepared: PreparedUndeclaration | null,
  loads: boolean,
  local: boolean,
): UndeclarePreview | null {
  if (prepared === null) return null;
  if (!loads) return { status: "manual", code: "NOT_LOADED", reason: NOT_LOADED };
  const preview = undeclarePreviewOf(prepared);
  if (local || preview?.status !== "ready") return preview;
  return { status: "manual", code: "NOT_LOCAL_PEER", reason: NOT_LOCAL };
}
