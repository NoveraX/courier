import { withImportsLock } from "../imports-lock";
import type { WriteBody } from "../write-types";
import type { DeclareApplyResult } from "./config-declare-types";
import { type ConfigEditDeps, declareAlone } from "./declare-alone";
import { runConfigEdit } from "./run-config-edit";

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
  return withImportsLock(() =>
    runConfigEdit(deps.project, (tx) => declareAlone(deps, tx, body, baseHash)),
  );
}
