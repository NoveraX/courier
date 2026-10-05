import { describeError } from "../describe-error";
import type { ExclusiveContext } from "../exclusive-context";
import { sha256Hex } from "../sha256-hex";
import type { ConfigDeclarationPlan } from "./config-declaration-types";
import type { ManualDeclaration } from "./config-declare-types";
import type { ConfigEditRefusalCode } from "./config-edit-refusal";
import type { PreparedDeclaration } from "./prepare-config-declaration";
import { replaceConfigFile } from "./replace-config-file";

/**
 * Put the config back as it was before the declaration was written, and say
 * why: Studio never ran the changed config, so once it is back, what is on
 * disk is again what Studio runs. A config Studio could not put back is
 * reloaded as it is once the edit ends, and the developer is told to check it.
 *
 * @param tx - The edit, alone on the reload chain
 * @param prepared - The change that was written
 * @param plan - What was written
 * @param refusal - Which case it is, and why the change is taken back
 * @param root - The project root, for the messages
 * @returns The declaration, left to the developer
 * @example
 * ```ts
 * return undoDeclaration(tx, prepared, plan, { code: "NOT_LOADED", why }, root);
 * ```
 */
export function undoDeclaration(
  tx: ExclusiveContext,
  prepared: PreparedDeclaration,
  plan: ConfigDeclarationPlan,
  refusal: { code: ConfigEditRefusalCode; why: string },
  root: string,
): ManualDeclaration {
  const { parts, text, mode, declaration } = prepared;
  const manual = (reason: string): ManualDeclaration => ({
    status: "manual",
    code: refusal.code,
    reason,
    declaration,
  });
  try {
    replaceConfigFile(parts.configPath, text, { mode, expectedHash: sha256Hex(plan.text) });
    tx.acknowledge([parts.configPath]);
    return manual(`${refusal.why}, so Studio put ${parts.configFile} back as it was.`);
  } catch (error) {
    tx.reloadAfter([parts.configPath]);
    const failed = `Studio could not put it back (${describeError(error, root)})`;
    return manual(`${refusal.why}, and ${failed}: check ${parts.configFile}.`);
  }
}
