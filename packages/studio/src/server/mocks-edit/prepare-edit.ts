import { realpathSync } from "node:fs";
import type { LoadedCourierConfig } from "../config-loader";
import { sha256Hex } from "../file-hash";
import { checkConfigNotShadowed } from "./check-config-not-shadowed";
import { checkLoadedState } from "./check-loaded-state";
import { checkNoHiddenKeys } from "./check-no-hidden-keys";
import { declarationState } from "./declaration-state";
import { inspectMocksTarget, type MocksTarget } from "./inspect-mocks-target";
import { manualOutcome } from "./manual-outcome";
import type { MocksEditContext } from "./mocks-edit-context";
import { MocksEditRefusal } from "./mocks-edit-refusal";
import { planMocksEdit } from "./plan/plan-mocks-edit";
import type { MocksPlan, PlanInput } from "./plan/types";
import { planInputFor } from "./plan-input";
import { probeMockPackage } from "./probe-mock-package";
import { type LoadState, runningState } from "./running-state";
import { snippetInputFromDisk } from "./snippet-input-from-disk";
import type { InvalidOutcome, ManualOutcome, MockDeclaration } from "./types";
import { validateDeclarations } from "./validate-declarations";

/** An edit planned against what Studio runs and what is on disk, ready to show or write. */
export interface PreparedEdit {
  status: "prepared";
  /** The project root, symlinks resolved. */
  root: string;
  loaded: LoadedCourierConfig;
  target: MocksTarget;
  input: PlanInput;
  plan: MocksPlan;
  baseHash: string | null;
  planDigest: string;
}

/**
 * Plan adding the requested mocks, or say why Studio will not.
 *
 * The file is planned only when Studio runs exactly what is on disk: a
 * config that fails to load, a mocks file that fails to load or has changed
 * since it loaded, would make the diff describe something other than what
 * the edit does.
 *
 * @param ctx - The running Studio
 * @param state - What it runs now
 * @param requests - The mocks to add, validated in shape
 * @returns The prepared edit, the fields that cannot be declared, or the reason to add them by hand
 */
export async function prepareEdit(
  ctx: MocksEditContext,
  state: LoadState,
  requests: readonly MockDeclaration[],
): Promise<PreparedEdit | InvalidOutcome | ManualOutcome> {
  const root = realpathSync(ctx.projectRoot);
  let input = snippetInputFromDisk(root, requests);
  let target: MocksTarget | null = null;
  try {
    const loaded = runningState(state, root);
    target = inspectMocksTarget(root);
    input = planInputFor(root, target, requests);
    return await planned(ctx, { root, loaded, target, input });
  } catch (err) {
    if (!(err instanceof MocksEditRefusal)) throw err;
    return manualOutcome(err, input, target?.relative ?? input.existing?.name ?? null);
  }
}

interface Planning {
  root: string;
  loaded: LoadedCourierConfig;
  target: MocksTarget;
  input: PlanInput;
}

async function planned(
  ctx: MocksEditContext,
  planning: Planning,
): Promise<PreparedEdit | InvalidOutcome> {
  const { root, loaded, target, input } = planning;
  checkLoadedState(loaded, target);
  const errors = validateDeclarations(input.requests, declarationState(ctx, loaded, target.name));
  if (errors.length > 0) return { status: "invalid", errors };
  await probeMockPackage(root);
  const plan = planMocksEdit(input);
  checkNoHiddenKeys(loaded, plan);
  await checkConfigNotShadowed(root, target.configName, target.relative, plan.configSpecifier);
  const baseHash = target.kind === "existing" ? target.hash : null;
  return { status: "prepared", ...planning, plan, baseHash, planDigest: sha256Hex(plan.text) };
}
