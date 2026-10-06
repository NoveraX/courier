import type { ExclusiveContext } from "../exclusive-context";
import { formatDuration } from "../format-duration";
import { ACT_BUDGET_MS, CONFIG_LOAD_TIMEOUT_MS } from "../project-state/budgets";
import type { ProjectState } from "../project-state/types";
import { withinBudget } from "../within-budget";

/** Studio was still loading the config, and changed nothing. */
export interface BusyEdit {
  status: "manual";
  code: "STUDIO_BUSY";
  reason: string;
}

/**
 * Run a change to the config alone on the reload chain, so the config it is
 * planned against is the one Studio runs. Studio still loading the config
 * when the budget runs out changes nothing: the edit, not started yet, is
 * dropped.
 *
 * @param project - The project Studio runs
 * @param edit - The change, given the edit's hold on the reload chain
 * @returns What the change did, or that Studio was busy
 * @example
 * ```ts
 * const result = await runConfigEdit(project, (tx) => declareAlone(deps, tx, body, baseHash));
 * ```
 */
export async function runConfigEdit<TResult>(
  project: ProjectState,
  edit: (tx: ExclusiveContext) => Promise<TResult>,
): Promise<TResult | BusyEdit> {
  let started = false;
  const dropped = new AbortController();
  const running = project.runExclusive(
    async (tx): Promise<TResult | null> => {
      if (dropped.signal.aborted) return null;
      started = true;
      return edit(tx);
    },
    CONFIG_LOAD_TIMEOUT_MS,
    dropped.signal,
  );
  if (!(await withinBudget(running, ACT_BUDGET_MS)) && !started) {
    dropped.abort();
    return busy();
  }
  return (await running) ?? busy();
}

function busy(): BusyEdit {
  return {
    status: "manual",
    code: "STUDIO_BUSY",
    reason: `Studio is still loading courier.config after ${formatDuration(ACT_BUDGET_MS)}, so it changed nothing. Try again once it has loaded.`,
  };
}
