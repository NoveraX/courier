import type { SetupIO } from "../setup-io";
import type { GitState } from "./git-state";

/** What a run says as it asks to go ahead, and as it does not. */
export interface GoAheadWords {
  /** The question a person at a terminal answers. */
  readonly question: string;
  /** What it says where nobody can answer and it was not told to go ahead. */
  readonly unasked: string;
  /** What it says where the person says no. */
  readonly declined: string;
}

/** What the command line said of going ahead. */
export interface GoAheadRun {
  readonly yes?: boolean | undefined;
  readonly "allow-dirty"?: boolean | undefined;
}

/**
 * Whether a run goes ahead and changes the project, once its plan is
 * shown: with `--yes`, or once the person at a terminal says yes. A run
 * that goes ahead without asking — `--yes`, or nobody at a terminal —
 * refuses a project whose changes git has not committed, which the
 * setup's would be mixed with, unless `--allow-dirty` says to go ahead
 * all the same; in a terminal the plan has shown the person them, and
 * they answer. Where it does not go ahead, it says why.
 *
 * @param run - What the command line asked for
 * @param io - Where to ask and to say why not
 * @param words - What it asks and says
 * @param git - What git says of the project; none for a project the run created
 * @returns Whether to go ahead
 * @throws {CancelledError} When the person cancels the question
 * @example
 * ```ts
 * if (!(await goAhead(run, io, words, git))) return 1;
 * ```
 */
export async function goAhead(
  run: GoAheadRun,
  io: SetupIO,
  words: GoAheadWords,
  git?: GitState,
): Promise<boolean> {
  const unattended = run.yes === true || io.questions === undefined;
  if (git?.kind === "dirty" && unattended && run["allow-dirty"] !== true) {
    io.report.end({
      kind: "refused",
      code: "GIT_DIRTY",
      said: "Nothing was changed: git has changes here not committed, which the setup's would be mixed with. Commit or stash them, or run it again with --allow-dirty.",
    });
    return false;
  }
  if (run.yes === true) return true;
  if (io.questions === undefined) {
    io.report.end({ kind: "refused", code: "CONFIRMATION_REQUIRED", said: words.unasked });
    return false;
  }
  if (await io.questions.confirm(words.question, true)) return true;
  io.report.end({ kind: "refused", code: "DECLINED", said: words.declined });
  return false;
}
