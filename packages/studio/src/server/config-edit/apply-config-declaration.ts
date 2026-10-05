import { formatDuration } from "../format-duration";
import { withImportsLock } from "../imports-lock";
import { ACT_BUDGET_MS, CONFIG_LOAD_TIMEOUT_MS } from "../project-state/budgets";
import { withinBudget } from "../within-budget";
import type { WriteBody } from "../write-types";
import type { DeclareApplyResult } from "./config-declare-types";
import { type ConfigEditDeps, declareAlone } from "./declare-alone";

/**
 * Declare an import in the config, as the preview quoted by `baseHash`
 * showed it: alone on the reload chain and while no other import is being
 * written, so the config Studio plans against is the one it runs. Studio
 * still loading the config when the budget runs out changes nothing.
 *
 * @param deps - The project, and its root
 * @param body - The import as written
 * @param baseHash - sha256 of the config the preview was planned against
 * @returns What the change did
 * @throws {NameTakenError} When `sources` declares another API under the import's name
 * @example
 * ```ts
 * const result = await applyConfigDeclaration({ project, projectRoot }, body, preview.baseHash);
 * result.status; // → "applied"
 * ```
 */
export function applyConfigDeclaration(
  deps: ConfigEditDeps,
  body: WriteBody,
  baseHash: string,
): Promise<DeclareApplyResult> {
  return withImportsLock(async () => {
    let started = false;
    const dropped = new AbortController();
    const edit = deps.project.runExclusive(
      async (tx): Promise<DeclareApplyResult | null> => {
        if (dropped.signal.aborted) return null;
        started = true;
        return declareAlone(deps, tx, body, baseHash);
      },
      CONFIG_LOAD_TIMEOUT_MS,
      dropped.signal,
    );
    if (!(await withinBudget(edit, ACT_BUDGET_MS)) && !started) {
      dropped.abort();
      return busy();
    }
    return (await edit) ?? busy();
  });
}

function busy(): DeclareApplyResult {
  return {
    status: "manual",
    code: "STUDIO_BUSY",
    reason: `Studio is still loading courier.config after ${formatDuration(ACT_BUDGET_MS)}, so it changed nothing. Try again once it has loaded.`,
  };
}
