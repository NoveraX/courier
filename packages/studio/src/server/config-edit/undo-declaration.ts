import type { ExclusiveContext } from "../exclusive-context";
import type { ConfigDeclarationPlan } from "./config-declaration-types";
import type { ManualDeclaration } from "./config-declare-types";
import type { ConfigEditRefusalCode } from "./config-edit-refusal";
import type { PreparedDeclaration } from "./prepare-config-declaration";
import { restoreConfig } from "./restore-config";

/**
 * Put the config back as it was before the declaration was written, and say
 * why, with the lines to add by hand.
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
  const before = { path: parts.configPath, file: parts.configFile, text, mode };
  const reason = restoreConfig(tx, before, plan.text, refusal.why, root);
  return { status: "manual", code: refusal.code, reason, declaration };
}
