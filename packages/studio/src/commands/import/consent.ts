import { createInterface } from "node:readline/promises";

import type { PlanSummary } from "../../server/import-files/plan-summary";

/** What the person allowed of the plan they were shown. */
export interface ConsentAnswer {
  /** The steps waiting for consent that they allowed, by path. */
  confirm: string[];
}

/** How the command may ask, and what it was told on the command line. */
export interface ConsentAsk {
  /** Apply the plan as Import API offers it, without asking. */
  yes: boolean;
  /** Steps waiting for consent allowed on the command line, by path. */
  confirm: readonly string[];
  /** Whether a person can answer: a terminal on both ends, and standard input free. */
  interactive: boolean;
  /** The question that writes the plan. */
  question: string;
  /** Ask a yes-or-no question; `preselected` is the answer to an empty reply. */
  ask: (question: string, preselected: boolean) => Promise<boolean>;
}

/**
 * Ask the person at the terminal a yes-or-no question on standard error, so
 * what the command prints on standard output stays its own.
 *
 * @param question - The question
 * @param preselected - The answer an empty reply gives
 * @returns The answer
 * @example
 * ```ts
 * if (await askYesNo("Write these files?", false)) write();
 * ```
 */
export async function askYesNo(question: string, preselected: boolean): Promise<boolean> {
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = (
      await prompt.question(`${question} ${preselected ? "[Y/n]" : "[y/N]"} `)
    ).trim();
    return answer === "" ? preselected : /^y(es)?$/i.test(answer);
  } finally {
    prompt.close();
  }
}

/**
 * Take the person's consent to a plan. With `--yes` the plan applies as
 * Import API offers it — the steps it offers ticked, and those named with
 * `--confirm` — and every other step leaves its file as it is. Asked, they
 * answer for the plan, then for each step waiting for them. Where no one
 * can answer, nothing is written without `--yes`.
 *
 * @param plan - The plan shown
 * @param how - How to ask, and what the command line said
 * @returns The steps allowed, or `null` when nothing is to be written
 * @example
 * ```ts
 * const answer = await consentTo(plan, { yes: false, confirm: [], interactive: true, question, ask: askYesNo });
 * ```
 */
export async function consentTo(plan: PlanSummary, how: ConsentAsk): Promise<ConsentAnswer | null> {
  const named = new Set(how.confirm);
  if (how.yes) {
    const offered = plan.pending.filter((step) => step.preselected).map((step) => step.path);
    return { confirm: [...new Set([...offered, ...named])] };
  }
  if (!how.interactive || !(await how.ask(how.question, false))) return null;
  const confirm: string[] = [];
  for (const step of plan.pending) {
    const verb = step.kind === "remove" ? "Remove" : "Replace";
    if (named.has(step.path) || (await how.ask(`${verb} ${step.path}?`, step.preselected))) {
      confirm.push(step.path);
    }
  }
  return { confirm };
}
