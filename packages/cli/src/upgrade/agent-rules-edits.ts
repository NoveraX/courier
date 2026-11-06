import { join, posix } from "node:path";
import {
  agentRulesProblem,
  readAgentFile,
  updatedAgentRules,
} from "@noverax/create-courier/agent-rules";
import type { ManualStep, Plan, PlannedEdit } from "@noverax/create-courier/engine";

import type { CourierPackage } from "./project-packages";

/** What an upgrade does with Courier's block in AGENTS.md: its changes, the steps left to the person, and each file's state. */
export interface AgentRulesEdits {
  readonly edits: readonly PlannedEdit[];
  readonly manual: readonly ManualStep[];
  readonly files: NonNullable<Plan["agentRules"]>;
}

const LEFT =
  "so Courier's block in it was left as it is: keep one pair of its markers, BEGIN before END, for the upgrade and Studio to keep it up to date";

/* The block brought up to date in a text as it is now: the text itself where it is up to date or holds none, nothing where its markers are broken. */
function updated(text: string): string | undefined {
  return updatedAgentRules(text) ?? (agentRulesProblem(text) === undefined ? text : undefined);
}

/**
 * Courier's block brought up to date in the AGENTS.md of the workspace's
 * root and of each of its packages that lists Courier, as Studio brings it
 * up to date as it starts: only in a file that holds the block, and only
 * between its markers — a file without it is the person's, and is left
 * unnamed. A file whose markers are repeated or out of order is left as
 * it is, with a step that says why; a link, or a file over 1 MiB, is not
 * read.
 *
 * @param root - The workspace's folder
 * @param packages - Courier's packages, as its manifests list them
 * @returns The changes, the steps left to the person, and what becomes of each file
 * @example
 * ```ts
 * agentRulesEdits(root, courierPackages(workspace)).files; // [{ path: "AGENTS.md", state: "update" }]
 * ```
 */
export function agentRulesEdits(
  root: string,
  packages: readonly CourierPackage[],
): AgentRulesEdits {
  const dirs = new Set(["", ...packages.map((each) => posix.dirname(each.manifest))]);
  dirs.delete(".");
  const edits: PlannedEdit[] = [];
  const manual: ManualStep[] = [];
  const files: Array<NonNullable<Plan["agentRules"]>[number]> = [];
  for (const dir of dirs) {
    const path = dir === "" ? "AGENTS.md" : `${dir}/AGENTS.md`;
    const file = readAgentFile(join(root, path));
    if (file.kind !== "text") continue;
    const problem = agentRulesProblem(file.text);
    if (problem !== undefined) {
      manual.push({
        file: path,
        what: `${problem.charAt(0).toUpperCase()}${problem.slice(1)}, ${LEFT}`,
        lines: [],
      });
      files.push({ path, state: "kept" });
      continue;
    }
    const after = updatedAgentRules(file.text);
    if (after === null) continue;
    const purpose = "brings Courier's block up to date";
    edits.push({ path, purpose, state: "edit", before: file.text, after, change: updated });
    files.push({ path, state: "update" });
  }
  return { edits, manual, files };
}
