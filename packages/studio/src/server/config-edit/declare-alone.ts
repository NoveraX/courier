import { createLogger } from "@noverax/courier";
import type { LoadedCourierConfig } from "../config-loader";
import { describeError } from "../describe-error";
import type { ExclusiveContext } from "../exclusive-context";
import type { ProjectState } from "../project-state/types";
import { resolvedRoot } from "../resolved-root";
import type { WriteBody } from "../write-types";
import type { ConfigDeclarationPlan } from "./config-declaration-types";
import type { DeclareApplyResult } from "./config-declare-types";
import { ConfigEditRefusal } from "./config-edit-refusal";
import { type PreparedDeclaration, prepareConfigDeclaration } from "./prepare-config-declaration";
import { previewOf } from "./preview-of";
import { replaceConfigFile } from "./replace-config-file";
import { undoDeclaration } from "./undo-declaration";

const log = createLogger("Studio");

/** What declaring an import reads and changes. */
export interface ConfigEditDeps {
  /** The project Studio runs, and the reload chain an edit holds. */
  project: ProjectState;
  /** The project root. */
  projectRoot: string;
}

/**
 * Declare an import in the config, alone on the reload chain: plan the
 * change against the config Studio runs, write it only while the config
 * still holds what the preview showed, load it, and run it once it declares
 * the import — or put the config back as it was and say why.
 *
 * @param deps - The project, and its root
 * @param tx - The edit's hold on the reload chain
 * @param body - The import as written
 * @param baseHash - sha256 of the config the preview was planned against
 * @returns What the change did
 * @throws {NameTakenError} When `sources` declares another API under the import's name
 * @example
 * ```ts
 * await project.runExclusive((tx) => declareAlone(deps, tx, body, baseHash), CONFIG_LOAD_TIMEOUT_MS);
 * ```
 */
export async function declareAlone(
  deps: ConfigEditDeps,
  tx: ExclusiveContext,
  body: WriteBody,
  baseHash: string,
): Promise<DeclareApplyResult> {
  const root = resolvedRoot(deps.projectRoot);
  const running = tx.current();
  const { failure } = deps.project.snapshot();
  if (running === null || failure !== null) {
    const reason =
      "courier.config does not load as it is on disk, so Studio changed nothing. Fix it first.";
    return { status: "manual", code: "NOT_LOADED", reason };
  }
  const prepared = prepareConfigDeclaration(body, running, root);
  if (prepared === null) return { status: "declared" };
  const { plan } = prepared;
  if (prepared.baseHash !== baseHash) return { status: "stale", preview: previewOf(prepared) };
  if (plan instanceof ConfigEditRefusal) {
    return {
      status: "manual",
      code: plan.code,
      reason: plan.message,
      declaration: prepared.declaration,
    };
  }
  try {
    replaceConfigFile(prepared.parts.configPath, plan.text, {
      mode: prepared.mode,
      expectedHash: baseHash,
    });
  } catch (error) {
    if (error instanceof ConfigEditRefusal)
      return { status: "stale", preview: previewOf(prepared) };
    const reason = `Studio could not write ${prepared.parts.configFile} (${describeError(error, root)}).`;
    return { status: "manual", code: "WRITE_FAILED", reason, declaration: prepared.declaration };
  }
  /* Written synchronously just above, so no watcher callback has run yet. */
  tx.acknowledge([prepared.parts.configPath]);
  return runChanged(deps, tx, prepared, plan, root);
}

async function runChanged(
  deps: ConfigEditDeps,
  tx: ExclusiveContext,
  prepared: PreparedDeclaration,
  plan: ConfigDeclarationPlan,
  root: string,
): Promise<DeclareApplyResult> {
  const { configFile } = prepared.parts;
  let loaded: LoadedCourierConfig;
  try {
    loaded = await tx.load();
  } catch (error) {
    const why = `${configFile} did not load once changed (${describeError(error, root)})`;
    return undoDeclaration(tx, prepared, plan, { code: "NOT_LOADED", why }, root);
  }
  const missing = missingFrom(loaded, prepared);
  if (missing !== null) {
    const why = `${configFile} loaded without ${missing}`;
    return undoDeclaration(tx, prepared, plan, { code: "PLAN_REJECTED", why }, root);
  }
  tx.apply(loaded);
  if (tx.current() !== loaded) {
    const why = `${configFile} loaded, but Studio could not run it; the terminal says why`;
    return undoDeclaration(tx, prepared, plan, { code: "NOT_LOADED", why }, root);
  }
  deps.project.importsChanged();
  log.info(`Studio declared ${prepared.name} in ${configFile}`);
  return { status: "applied", configFile };
}

/* What the loaded config should declare now and does not, if anything. */
function missingFrom(loaded: LoadedCourierConfig, prepared: PreparedDeclaration): string | null {
  const { name, parts } = prepared;
  if (parts.source && !Object.hasOwn(loaded.config.sources ?? {}, name)) {
    return `${name} under \`sources\``;
  }
  if (parts.importEntry && !Object.hasOwn(loaded.config.imports ?? {}, name)) {
    return `${name} under \`imports\``;
  }
  return null;
}
