import { createLogger } from "@noverax/courier";
import type { LoadedCourierConfig } from "../config-loader";
import type { ExclusiveContext } from "../exclusive-reload";
import { describeEntry } from "../mock-manager/describe-entry";
import { describeError } from "./describe-error";
import type { PreparedEdit } from "./prepare-edit";
import { rejectionOf } from "./rejection-of";
import type { DeclareApplyResult } from "./types";
import { undoEdit } from "./undo-edit";
import type { Written } from "./write-planned";

const log = createLogger("Studio");

/**
 * Load the written files and run them only if they are the edit Studio
 * meant; otherwise take the edit back.
 *
 * @param tx - The edit's hold on the reload chain
 * @param prepared - The edit that was written
 * @param written - The write, with a temporary file it could not remove
 * @returns What happened
 */
export async function verifyAndApply(
  tx: ExclusiveContext,
  prepared: PreparedEdit,
  written: Written,
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
  const keys = input.requests.map((request) => request.key);
  log.info(`Studio added ${keys.join(", ")} to ${target.relative}`);
  const warnings = await describeProblems(loaded, keys);
  if (written.leftover) warnings.push(leftoverWarning(written.leftover, target.relative));
  return { status: "applied", target: target.relative, keys, warnings };
}

/* A mock that loads but cannot be described serves no routes; say so now
   rather than leave the developer to find it in the Mocks view. */
async function describeProblems(
  loaded: LoadedCourierConfig,
  keys: readonly string[],
): Promise<string[]> {
  const problems: string[] = [];
  for (const key of keys) {
    const described = await describeEntry(key, loaded.mocks.entries[key]);
    if ("problem" in described) problems.push(described.problem);
  }
  return problems;
}

function leftoverWarning(leftover: string, target: string): string {
  return `Studio could not remove its temporary file ${leftover}. Delete it: while it exists, Studio refuses to edit ${target}, which it is linked to.`;
}
