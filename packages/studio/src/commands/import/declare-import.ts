import type { TerminalStyle } from "@noverax/courier/internal";

import { applyConfigDeclaration } from "../../server/config-edit/apply-config-declaration";
import type {
  DeclaredAlready,
  ManualDeclaration,
} from "../../server/config-edit/config-declare-types";
import type { ConfigEditDeps } from "../../server/config-edit/declare-alone";
import { prepareConfigDeclaration } from "../../server/config-edit/prepare-config-declaration";
import { previewOf } from "../../server/config-edit/preview-of";
import { readConfigToAct } from "../../server/project-state/read-config-to-act";
import type { WriteBody } from "../../server/write-types";
import { declarationLines } from "./declaration-lines";

/** What declaring the import did: the lines that say so, and the exit status it leaves. */
export interface DeclareOutcome {
  lines: string[];
  /** `1` when the config changed while the import was written, so nothing was declared. */
  status: 0 | 1;
}

function leftAsItIs(
  result: ManualDeclaration | DeclaredAlready,
  name: string,
  style: TerminalStyle,
): DeclareOutcome {
  if (result.status === "declared") {
    return { lines: [`The config declares ${name} already.`], status: 0 };
  }
  const by = result.declaration
    ? ["Add these lines to it:", ...declarationLines(result.declaration)]
    : [];
  return {
    lines: [style.yellow(`The config was left as it is: ${result.reason}`), ...by],
    status: 0,
  };
}

/**
 * Declare an import whose files are written in `courier.config.ts`, as
 * Import API's **Add to courier.config.ts** does: the import of the
 * generated source, its `sources` entry and its `imports` entry, written
 * like the rest of the file; the config is then loaded, and put back as it
 * was when it no longer loads. A config written in a way Studio cannot add
 * to safely is left as it is, with the lines to add by hand.
 *
 * @param body - The import as it was written
 * @param deps - The project and its root
 * @param style - How the terminal is painted
 * @returns What happened, in lines, and the exit status
 * @example
 * ```ts
 * const { lines, status } = await declareImport(body, { project, projectRoot: root }, style);
 * ```
 */
export async function declareImport(
  body: WriteBody,
  deps: ConfigEditDeps,
  style: TerminalStyle,
): Promise<DeclareOutcome> {
  const loaded = await readConfigToAct(deps.project, deps.projectRoot);
  const preview = previewOf(prepareConfigDeclaration(body, loaded, deps.projectRoot));
  if (preview.status !== "ready") return leftAsItIs(preview, body.sourceName, style);
  const applied = await applyConfigDeclaration(deps, body, preview.baseHash);
  if (applied.status === "applied") {
    return { lines: [`Declared ${body.sourceName} in ${applied.configFile}.`], status: 0 };
  }
  if (applied.status === "stale") {
    const changed = `${preview.configFile} changed while the import was written; run the command again to declare it.`;
    return { lines: [style.yellow(changed)], status: 1 };
  }
  return leftAsItIs(applied, body.sourceName, style);
}
