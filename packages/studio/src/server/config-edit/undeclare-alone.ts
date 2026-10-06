import { createLogger } from "@noverax/courier";
import type { LoadedCourierConfig } from "../config-loader";
import { configReads } from "../config-reads";
import { describeError } from "../describe-error";
import type { ExclusiveContext } from "../exclusive-context";
import { resolvedRoot } from "../resolved-root";
import { ConfigEditRefusal, type ConfigEditRefusalCode } from "./config-edit-refusal";
import type {
  ConfigUndeclarationPlan,
  ManualUndeclaration,
  UndeclareRequest,
  UndeclareResult,
} from "./config-undeclaration-types";
import type { ConfigEditDeps } from "./declare-alone";
import {
  type PreparedUndeclaration,
  prepareConfigUndeclaration,
} from "./prepare-config-undeclaration";
import { replaceConfigFile } from "./replace-config-file";
import { restoreConfig } from "./restore-config";
import { undeclarePreviewOf } from "./undeclare-preview-of";

const log = createLogger("Studio");

/**
 * Take an import out of the config, alone on the reload chain: plan the
 * change against the config Studio runs, write it only while the config
 * still holds what the preview showed, load it, and run it once it no
 * longer declares the import nor reads any file the removal takes — or put
 * the config back as it was and say why.
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
  try {
    replaceConfigFile(prepared.configPath, plan.text, {
      mode: prepared.mode,
      expectedHash: request.baseHash,
    });
  } catch (error) {
    if (error instanceof ConfigEditRefusal) {
      return { status: "stale", preview: undeclarePreviewOf(prepared) };
    }
    const reason = `Studio could not write ${prepared.configFile} (${describeError(error, root)}).`;
    return manual("WRITE_FAILED", reason);
  }
  /* Written synchronously just above, so no watcher callback has run yet. */
  tx.acknowledge([prepared.configPath]);
  return runChanged(deps, tx, prepared, plan, request.taking);
}

async function runChanged(
  deps: ConfigEditDeps,
  tx: ExclusiveContext,
  prepared: PreparedUndeclaration,
  plan: ConfigUndeclarationPlan,
  taking: readonly string[],
): Promise<UndeclareResult> {
  const root = resolvedRoot(deps.projectRoot);
  const { configFile, configPath, text, mode } = prepared;
  const undo = (code: ConfigEditRefusalCode, why: string): ManualUndeclaration => {
    const before = { path: configPath, file: configFile, text, mode };
    return manual(code, restoreConfig(tx, before, plan.text, why, root));
  };
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
  log.info(`Studio took ${prepared.name} out of ${configFile}`);
  return { status: "applied", configFile };
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
