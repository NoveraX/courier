import type { LoadedForRoutes, ProjectRoot } from "@noverax/courier-cli/devkit";
import { findFormatters, formatProjectFiles } from "@noverax/courier-cli/devkit";
import { computeSpecHash, type ParsedSpec } from "../apis";
import type { ImportStateEntry } from "../apis/imports-state";
import { type ImportLayout, resolveImportLayout } from "../apis/layout";
import { previewAddEndpoints, previewRemoveEndpoints } from "../apis/manage";
import { addedEndpointsCode } from "../apis/manage/added-endpoints-code";
import { isFlatImport } from "../apis/manage/flat-import";
import { listedSelection } from "../apis/manage/listed-selection";
import { proxyAfterChange } from "../apis/manage/proxy-after-change";
import type { AddResult, RemoveResult } from "../apis/manage/types";
import { extractEndpoints } from "../apis/merge/extract-endpoints";
import { isTopLevel } from "../apis/parser/top-level";
import { checkDirOverlap } from "./check-dir-overlap";
import { checkFormerFolder } from "./check-former-folder";
import { generatedFromSpec } from "./generated-from-spec";
import { generatedImportExtension } from "./generated-import-extension";
import type { FilePlan } from "./import-files/file-plan-types";
import { importBodies } from "./import-files/import-bodies";
import { planFiles } from "./import-files/plan-files";
import { getImportEntry, getImportState, type ImportsSnapshot } from "./imports-bridge";
import { manageFingerprints } from "./manage-fingerprints";
import { managePlanRequest } from "./manage-plan-request";
import { planManageUpdate } from "./manage-update-plan";
import { formatPlannedWrites } from "./project-format/format-planned-writes";
import { withRoutesModule } from "./routes-module/with-routes-module";
import { unknownRemovals } from "./unknown-removals";

/** The endpoints to add and remove of an import, by group. */
export interface ManageRequest {
  name: string;
  /** The specification the endpoints are generated from, as the import's declaration makes it. */
  spec: ParsedSpec;
  /** The hash to record: of the specification as sent, when the declaration reshaped it. */
  specHash?: string;
  toAdd: Record<string, string[]>;
  toRemove: Record<string, string[]>;
  /** Write every file again from the spec, keeping the user's edits, though it did not change. */
  regenerate?: boolean;
}

/** What adding and removing endpoints produces, and the plan that writes it. */
export interface ManagePlan {
  addResult?: AddResult;
  removeResult?: RemoveResult;
  plan: FilePlan;
  entry: ImportStateEntry | undefined;
  layout: ImportLayout;
}

/**
 * Work out adding and removing endpoints of a declared import, from its
 * files on disk: endpoints are added first and removed from the result, so
 * a file both change carries both. A specification other than the one the
 * import was last generated from is an update, which generates what stays
 * from it afresh (see `planManageUpdate`), and so is regenerating from the
 * same one. The plan says what is written, removed and kept, and what waits
 * for the user.
 *
 * @param body - The import, its spec, and the endpoints to add and remove by group
 * @param imports - The declarations of the config Studio runs, with the imports state
 * @param root - The project
 * @param running - The config Studio runs, which says where the routes module is
 * @returns The changes and their plan, or the error to answer with and its status
 * @throws {DirOverlapError} When another import owns a directory overlapping the import's
 * @throws {ImportRenamedError} When the import's files are still where Studio 0.3.0 bound it otherwise
 * @throws {InvalidSpecError} When a value the spec gives that would be written as code is refused
 * @throws {SpecGenerationError} When the spec cannot be generated from
 */
export async function planManage(
  body: ManageRequest,
  imports: ImportsSnapshot,
  root: ProjectRoot,
  running: LoadedForRoutes | null = null,
): Promise<ManagePlan | { error: string; status: number }> {
  const entryDeclared = getImportEntry(imports, body.name);
  if (!entryDeclared) return { error: `Source "${body.name}" not found`, status: 404 };
  const declared = withRoutesModule(entryDeclared, running);
  const entry = getImportState(imports, body.name);
  const layout = resolveImportLayout(declared, body.name);
  checkDirOverlap(body.name, layout.dir, imports);
  checkFormerFolder(root, body.name, declared, layout, entry);
  const onDisk = importBodies(root, layout.dir);
  const flat = isFlatImport(declared);
  /* Endpoints are picked as the import lists them; one it cannot generate would be a dangling import. */
  const { unknown } = listedSelection(body.spec, declared.groupBy ?? "tag", body.toAdd);
  if (unknown.length > 0) {
    return { error: `The spec generates no endpoint ${unknown.join(", ")} to add`, status: 400 };
  }
  const absent = unknownRemovals(body.toRemove, layout, onDisk, flat);
  if (absent.length > 0) {
    return {
      error: `The import's files hold no endpoint ${absent.join(", ")} to remove`,
      status: 400,
    };
  }
  /* A newer specification is an update: what stays is generated from it afresh. So is
     regenerating, from the same one: a newer Studio may write it differently. */
  const specHash = body.specHash ?? computeSpecHash(body.spec);
  if (body.regenerate === true && entry === undefined) {
    const error = `Studio has no record of writing ${body.name}, so it cannot tell your edits from its code; import it again instead`;
    return { error, status: 409 };
  }
  if (entry !== undefined && (entry.specHash !== specHash || body.regenerate === true)) {
    return planManageUpdate({ ...body, specHash }, imports, root, { declared, entry, layout });
  }
  const toAdd = Object.fromEntries(
    Object.entries(body.toAdd).filter(([, names]) => names.length > 0),
  );
  const importExtension = generatedImportExtension(root.path, layout);
  const options = { ...declared, ...(importExtension && { importExtension }) };
  /* Formatted as the project formats its code before anything reads it, as a full write is. */
  const formatters = findFormatters(root.path);
  const added =
    Object.keys(toAdd).length > 0
      ? await formatProjectFiles(
          root.path,
          generatedFromSpec(() => addedEndpointsCode(body.spec, toAdd, options, layout)),
          formatters,
        )
      : undefined;
  const addResult =
    added && previewAddEndpoints(body.spec, toAdd, options, onDisk, layout, added.files);
  const afterAdd = { ...onDisk, ...contentsOf(addResult) };
  const fingerprints = manageFingerprints(entry, onDisk);
  const removeResult = !Object.values(body.toRemove).some((names) => names.length > 0)
    ? undefined
    : previewRemoveEndpoints(body.toRemove, afterAdd, fingerprints, layout);
  if (flat && removeResult && leavesNoEndpoint(removeResult, layout.sourceFile)) {
    const error = "A flat import keeps at least one endpoint; remove the import to drop them all";
    return { error, status: 400 };
  }
  const fileOf = (group: string): string =>
    flat || isTopLevel(group) ? layout.sourceFile : layout.groupFile(group);
  const proxy = generatedFromSpec(() => proxyAfterChange(body.spec, options, layout));
  const whole = proxy ? (await formatProjectFiles(root.path, [proxy], formatters)).files : [];
  const changes = { toRemove: body.toRemove, added: addResult, removed: removeResult, whole };
  const request = managePlanRequest(layout, changes, entry, fileOf);
  return {
    ...(addResult && { addResult }),
    ...(removeResult && { removeResult }),
    plan: await formatPlannedWrites(
      root.path,
      planFiles(root, request, entry?.files ?? {}),
      formatters,
      added ?? null,
    ),
    entry,
    layout,
  };
}

/* A flat API with no endpoint is one no caller accepts. */
function leavesNoEndpoint(removed: RemoveResult, sourceFile: string): boolean {
  const source = removed.modifiedFiles.find((file) => file.path === sourceFile);
  return source !== undefined && Object.keys(extractEndpoints(source.content)).length === 0;
}

function contentsOf(added: AddResult | undefined): Record<string, string> {
  if (!added) return {};
  return Object.fromEntries(added.files.map((file) => [file.path, file.content]));
}
