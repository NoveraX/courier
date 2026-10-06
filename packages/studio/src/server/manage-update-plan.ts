import type { CourierImportEntry } from "@noverax/courier/config";
import type { ImportStateEntry } from "../apis/imports-state";
import type { ImportLayout } from "../apis/layout";
import { listedSelection } from "../apis/manage/listed-selection";
import type { EndpointInventory } from "../apis/manage/types";
import { ownValue } from "../apis/own-value";
import type { ImportsSnapshot } from "./imports-bridge";
import { handleInventory } from "./manage-helpers";
import type { ManagePlan, ManageRequest } from "./manage-plan";
import type { ProjectRoot } from "./project-fs/project-root";
import { planRegeneration } from "./regenerate-import";

/** The import a change to endpoints acts on, as the manage plan resolved it. */
export interface ManagedImport {
  declared: CourierImportEntry;
  entry: ImportStateEntry | undefined;
  layout: ImportLayout;
}

/**
 * Plan bringing an import up to a newer specification with the endpoints
 * the user keeps: each endpoint its files hold that the specification still
 * describes, but those picked to remove, and each one picked to add — all
 * generated afresh, so their code and schemas follow the specification, and
 * merged with the user's edits as an update merges them. An endpoint the
 * specification no longer describes goes; one the user added stays.
 *
 * @param body - The import, the newer specification, and the endpoints to add and remove
 * @param imports - The declarations of the config Studio runs, with the imports state
 * @param root - The project
 * @param managed - The import's declaration, record and layout
 * @returns The plan, or the error to answer with and its status
 * @throws {SpecGenerationError} When the specification cannot be generated from
 * @example
 * ```ts
 * const planned = planManageUpdate(request, imports, root, { declared, entry, layout });
 * ```
 */
export function planManageUpdate(
  body: ManageRequest & { specHash: string },
  imports: ImportsSnapshot,
  root: ProjectRoot,
  { declared, entry, layout }: ManagedImport,
): ManagePlan | { error: string; status: number } {
  const inventory = handleInventory(
    { name: body.name, newSpec: body.spec },
    imports,
    root,
    body.specHash,
  );
  if ("error" in inventory) return inventory;
  const picks = keptEndpoints(inventory, body.toAdd, body.toRemove);
  if (Object.keys(picks).length === 0) {
    const error = "An update keeps at least one endpoint; remove the import to drop them all";
    return { error, status: 400 };
  }
  const { selection } = listedSelection(body.spec, declared.groupBy ?? "tag", picks);
  const { plan } = planRegeneration({
    root,
    name: body.name,
    layout,
    spec: body.spec,
    specHash: body.specHash,
    options: { ...declared, selectedEndpoints: selection },
    entry,
  });
  return { plan, entry, layout };
}

/* The endpoints there are once the change is made, by the groups the import lists. */
function keptEndpoints(
  inventory: EndpointInventory,
  toAdd: Record<string, string[]>,
  toRemove: Record<string, string[]>,
): Record<string, string[]> {
  const picks: Record<string, string[]> = {};
  for (const group of inventory.groups) {
    const adding = new Set(ownValue(toAdd, group.name) ?? []);
    const removing = new Set(ownValue(toRemove, group.name) ?? []);
    const names = group.endpoints
      .filter(({ name, status }) =>
        status === "active" ? !removing.has(name) : status === "available" && adding.has(name),
      )
      .map(({ name }) => name);
    if (names.length > 0) picks[group.name] = names;
  }
  return picks;
}
