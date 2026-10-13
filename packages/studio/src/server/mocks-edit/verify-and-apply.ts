import { createLogger } from "@noverax/courier";
import type { LoadedCourierConfig } from "../config-loader";
import { describeError } from "../describe-error";
import type { ExclusiveContext } from "../exclusive-context";
import { describeEntry } from "../mock-manager/describe-entry";
import type { PreparedEdit } from "./prepare-edit";
import { rejectionOf } from "./rejection-of";
import { restartWarning } from "./restart-warning";
import type { DeclareApplyResult } from "./types";
import { undoEdit } from "./undo-edit";
import type { Written } from "./write-planned";

const log = createLogger("Studio");

/**
 * Load the written files and run them only if they are the edit Studio
 * meant; otherwise take the edit back. So too when Studio cannot run the
 * load: the files then go back to what it runs.
 *
 * @param tx - The edit's hold on the reload chain
 * @param prepared - The edit that was written
 * @param written - The write, with a temporary file it could not remove
 * @param restarting - The running mocks the edit restarts, told again once it is applied
 * @returns What happened
 */
export async function verifyAndApply(
  tx: ExclusiveContext,
  prepared: PreparedEdit,
  written: Written,
  restarting: readonly string[],
): Promise<DeclareApplyResult> {
  const { root, target, input } = prepared;
  let loaded: LoadedCourierConfig;
  try {
    loaded = await tx.load();
  } catch (err) {
    return undoEdit(
      tx,
      prepared,
      `the edited files did not load: ${describeError(err, root)}`,
      written.leftoverPath,
    );
  }
  const rejection = rejectionOf(prepared.loaded, loaded, input.requests, target.path, root);
  if (rejection) return undoEdit(tx, prepared, rejection, written.leftoverPath);
  tx.apply(loaded);
  if (tx.current() !== loaded) {
    const reason = "the edited files loaded, but Studio could not run them; the terminal says why";
    return undoEdit(tx, prepared, reason, written.leftoverPath);
  }
  const keys = input.requests.map((request) => request.key);
  log.info(`Studio added ${keys.join(", ")} to ${target.relative}`);
  const warnings = [...restartWarning(restarting), ...(await describeProblems(loaded, keys, root))];
  if (written.leftover) warnings.push(leftoverWarning(written.leftover, target.relative));
  return { status: "applied", target: target.relative, keys, warnings };
}

/* A mock that loads but cannot be described serves no routes; say so now
   rather than leave the developer to find it in the Mocks view. */
async function describeProblems(
  loaded: LoadedCourierConfig,
  keys: readonly string[],
  root: string,
): Promise<string[]> {
  const problems: string[] = [];
  for (const key of keys) {
    const described = await describeEntry(key, loaded.mocks.entries[key], root);
    if ("problem" in described) problems.push(described.problem);
  }
  return problems;
}

function leftoverWarning(leftover: string, target: string): string {
  return `Studio could not remove its temporary file ${leftover}. Delete it: while it exists, Studio refuses to edit ${target}, which it is linked to.`;
}
