import { join } from "node:path";

import { errnoCode, replaceFile } from "../apply/file-ops";
import { readAgentFile } from "./agent-file";
import { agentRulesProblem, updatedAgentRules } from "./rules-text";

/** What bringing Courier's block in AGENTS.md up to date did, where it did anything: written, or left as it is and why. */
export type AgentRulesUpdate =
  | { readonly kind: "updated"; readonly path: string }
  | { readonly kind: "left"; readonly path: string; readonly why: string };

/**
 * Bring Courier's block in a folder's AGENTS.md up to date, as Studio
 * does as it starts: only in a file that holds the block — never one
 * without it, which is the person's, and never a file where there is
 * none — and only between its markers. The file is written whole, all at
 * once, its mode kept. A file whose markers are repeated or out of order
 * is left as it is, and so is one that cannot be written: why is said,
 * for one line of the log. A read-only file is never written.
 *
 * @param dir - The folder AGENTS.md is in: the project's root
 * @returns What was done, with the file's path under `dir`, or `null` where there was nothing to do: no AGENTS.md, a link, a read-only file, one over 1 MiB or not UTF-8, no block in it, or the block up to date
 * @example
 * ```ts
 * const update = updateAgentRules(projectRoot);
 * if (update?.kind === "left") log.warn(`${update.path} was left as it is: ${update.why}`);
 * ```
 */
export function updateAgentRules(dir: string): AgentRulesUpdate | null {
  const path = join(dir, "AGENTS.md");
  const file = readAgentFile(path);
  if (file.kind !== "text") return null;
  const problem = agentRulesProblem(file.text);
  if (problem !== undefined) return { kind: "left", path, why: problem };
  const updated = updatedAgentRules(file.text);
  if (updated === null) return null;
  try {
    replaceFile(path, updated);
  } catch (error) {
    return { kind: "left", path, why: `it could not be written (${errnoCode(error) ?? "error"})` };
  }
  return { kind: "updated", path };
}
