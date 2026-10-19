import { projectRootAt } from "@noverax/courier-cli/devkit";
import { resolveImportLayout } from "../apis/layout";
import { checkDeclaredDirectory } from "./check-declared-directory";
import { checkDirOverlap } from "./check-dir-overlap";
import { describeImportDeclaration } from "./describe-import-declaration";
import type { PlanSummary } from "./import-files/plan-summary";
import { previewSummary } from "./import-files/preview-summary";
import { getImportEntry, getImportState, importsSnapshotOf } from "./imports-bridge";
import { readConfigToAct } from "./project-state/read-config-to-act";
import type { ProjectImports } from "./project-state/types";
import { applyRegeneration, planRegeneration, type Regeneration } from "./regenerate-import";
import { withRoutesModule } from "./routes-module/with-routes-module";
import { declaredSpec } from "./spec-as-declared";
import type { ImportDeclaration, WriteBody, WriteResult } from "./write-types";

/** What writing an import reads the project from. */
export interface ImportWriteDeps {
  /** The project: its config as it is on disk, and a way to announce what was written. */
  project: ProjectImports;
  /** The project root, symlinks resolved: where the imports state lives. */
  projectRoot: string;
}

/** What writing an import would do, worked out without writing anything. */
export interface ImportWritePlan {
  /** Every file the write creates, replaces, removes or keeps, and the steps that wait for consent. */
  plan: PlanSummary;
  /** Files Studio wrote before the import's directory moved, which the write leaves where they are. */
  leftBehind: string[];
  /** What the config must still declare once the files are written; absent when it declares all of it. */
  declaration: ImportDeclaration | undefined;
}

/* What to generate, and what the config must still declare: read once the imports lock is held. */
async function prepare(
  body: WriteBody,
  { project, projectRoot }: ImportWriteDeps,
): Promise<{ regeneration: Regeneration; declaration: ImportDeclaration | undefined }> {
  const loaded = await readConfigToAct(project, projectRoot);
  const imports = importsSnapshotOf(loaded.config.imports, projectRoot);
  const name = body.sourceName;
  const entry = getImportEntry(imports, name);
  checkDeclaredDirectory(name, entry, body.options);
  const layout = resolveImportLayout(entry ?? body.options, name);
  checkDirOverlap(name, layout.dir, imports);
  const declaration = describeImportDeclaration({ name, body, loaded, root: projectRoot });
  const regeneration: Regeneration = {
    root: projectRootAt(projectRoot),
    name,
    layout,
    ...(await declaredSpec(entry, name, body.spec)),
    options: withRoutesModule(body.options, loaded),
    entry: getImportState(imports, name),
    origin: body.origin ?? "given",
  };
  return { regeneration, declaration };
}

/**
 * Work out what writing an import's files would do, and write nothing: the
 * plan the write would apply now, whose digest a write then quotes, so it
 * applies only that plan.
 *
 * @param body - The import's name, its specification and the options
 * @param deps - The project the import's declaration is read from
 * @returns The plan, the files left behind, and what the config must still declare
 * @throws {ProjectUnavailableError} While the config does not load as it is on disk
 * @throws {DeclarationMismatchError} When the import's declaration gives other options
 * @example
 * ```ts
 * const { plan } = await withImportsLock(() => planImportWrite(body, deps));
 * await withImportsLock(() => writeImport({ ...body, planDigest: plan.digest }, deps));
 * ```
 */
export async function planImportWrite(
  body: WriteBody,
  deps: ImportWriteDeps,
): Promise<ImportWritePlan> {
  const { regeneration, declaration } = await prepare(body, deps);
  const { plan, leftBehind } = await planRegeneration(regeneration);
  return { plan: previewSummary(regeneration.root, plan), leftBehind, declaration };
}

/**
 * Write an import's files into the project.
 *
 * Studio generates the files itself, from the spec and the options the
 * body names, into the directory the import's declaration gives it, or the
 * options when courier.config does not declare it yet. The files are
 * planned by who owns each one and applied all at once, only while the
 * config loads as it is on disk. A plan with steps only the user may allow
 * is refused with the plan, and applied once the body quotes its digest
 * with the steps allowed.
 *
 * It changes no config: the result says what the config must still
 * declare for the import — the generated source under `sources` and the
 * entry under `imports`. While `sources` declares another API under the
 * import's name, or another import owns a directory overlapping the
 * import's, nothing is written.
 *
 * @param body - The import's name, its specification, the options and the consent given
 * @param deps - The project the import's declaration is read from
 * @returns What was written, removed and kept, and what the config must still declare
 * @throws {FilePlanError} `NEEDS_CONFIRMATION` with the plan while steps wait for consent
 * @example
 * ```ts
 * const result = await withImportsLock(() => writeImport(body, deps));
 * ```
 */
export async function writeImport(body: WriteBody, deps: ImportWriteDeps): Promise<WriteResult> {
  const { regeneration, declaration } = await prepare(body, deps);
  const { report, leftBehind } = await applyRegeneration(regeneration, body, "when-shown");
  deps.project.importsChanged();
  return {
    written: report.written,
    removed: report.removed,
    kept: report.kept,
    ...(report.backupDir !== undefined && { backupDir: report.backupDir }),
    pruneFailures: report.pruneFailures,
    leftBehind,
    ...(declaration && { declaration }),
  };
}
