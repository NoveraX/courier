import { createLogger } from "@noverax/courier";
import type { LoadedCourierConfig } from "../config-loader";
import { configReads } from "../config-reads";
import { describeError } from "../describe-error";
import type { ExclusiveContext } from "../exclusive-context";
import { resolvedRoot } from "../resolved-root";
import { ConfigEditRefusal, type ConfigEditRefusalCode } from "./config-edit-refusal";
import type {
  ManualUndeclaration,
  UndeclareRequest,
  UndeclareResult,
} from "./config-undeclaration-types";
import type { ConfigEditDeps } from "./declare-alone";
import { type FileChange, listed, restoreFileChanges, writeFileChanges } from "./file-changes";
import {
  type PreparedUndeclaration,
  prepareConfigUndeclaration,
} from "./prepare-config-undeclaration";
import { undeclarePreviewOf } from "./undeclare-preview-of";

const log = createLogger("Studio");

/**
 * Take an import out of the config, alone on the reload chain: plan the
 * change against the config Studio runs, write it only while the files it
 * changes — the config, and the module the config takes its `sources` from
 * when the source is listed there — still hold what the preview showed,
 * load it, and run it once it no longer declares the import nor reads any
 * file the removal takes — or put every file back as it was and say why.
 *
 * @param deps - The project, and its root
 * @param tx - The edit's hold on the reload chain
 * @param request - The import, the files the removal may take and takes, and the preview's hash
 * @returns What the change did
 * @example
 * ```ts
 * await runConfigEdit(project, (tx) => undeclareAlone(deps, tx, request));
 * ```
 */
export async function undeclareAlone(
  deps: ConfigEditDeps,
  tx: ExclusiveContext,
  request: UndeclareRequest,
): Promise<UndeclareResult> {
  const root = resolvedRoot(deps.projectRoot);
  const running = tx.current();
  if (running === null || deps.project.snapshot().failure !== null) {
    const reason =
      "courier.config does not load as it is on disk, so Studio changed nothing. Fix it first, or remove the import without changing the config.";
    return { status: "manual", code: "NOT_LOADED", reason };
  }
  const prepared = prepareConfigUndeclaration(request.name, running, root, request.mayTake);
  if (prepared === null) return { status: "stale", preview: null };
  const { plan } = prepared;
  if (prepared.baseHash !== request.baseHash) {
    return { status: "stale", preview: undeclarePreviewOf(prepared) };
  }
  if (plan instanceof ConfigEditRefusal) return manual(plan.code, plan.message);
  const outcome = writeFileChanges(plan, tx, root);
  if (outcome.status === "stale") return { status: "stale", preview: undeclarePreviewOf(prepared) };
  if (outcome.status === "failed") return manual("WRITE_FAILED", outcome.reason);
  return runChanged(deps, tx, prepared, outcome.written, request.taking);
}

async function runChanged(
  deps: ConfigEditDeps,
  tx: ExclusiveContext,
  prepared: PreparedUndeclaration,
  written: readonly FileChange[],
  taking: readonly string[],
): Promise<UndeclareResult> {
  const root = resolvedRoot(deps.projectRoot);
  const { configFile } = prepared;
  const undo = (code: ConfigEditRefusalCode, why: string): ManualUndeclaration =>
    manual(code, restoreFileChanges(tx, written, why, root));
  let loaded: LoadedCourierConfig;
  try {
    loaded = await tx.load();
  } catch (error) {
    return undo(
      "NOT_LOADED",
      `${configFile} did not load once changed (${describeError(error, root)})`,
    );
  }
  const left = leftOf(loaded, prepared, root, taking);
  if (left !== null) return undo("PLAN_REJECTED", `Once changed, ${configFile} ${left}`);
  tx.apply(loaded);
  if (tx.current() !== loaded) {
    return undo(
      "NOT_LOADED",
      `${configFile} loaded, but Studio could not run it; the terminal says why`,
    );
  }
  deps.project.importsChanged();
  const files = written.map((change) => change.file);
  log.info(`Studio took ${prepared.name} out of ${listed(files)}`);
  return { status: "applied", configFile, files };
}

/* What the loaded config still holds of the import, if anything. */
function leftOf(
  loaded: LoadedCourierConfig,
  { name, source, importEntry }: PreparedUndeclaration,
  root: string,
  taking: readonly string[],
): string | null {
  if (source && Object.hasOwn(loaded.config.sources ?? {}, name)) {
    return `still declares ${name} under \`sources\``;
  }
  if (importEntry && Object.hasOwn(loaded.config.imports ?? {}, name)) {
    return `still declares ${name} under \`imports\``;
  }
  const read = configReads(loaded, root, taking);
  if (read.length > 0) return `still imports ${read.join(", ")}, which the removal takes`;
  return null;
}

function manual(code: ConfigEditRefusalCode, reason: string): ManualUndeclaration {
  return { status: "manual", code, reason };
}
