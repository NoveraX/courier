/**
 * Project initialization — ensures `.courier/` is in `.gitignore`.
 *
 * The imports-state file materializes itself on first write, so no registry
 * bootstrap step is required anymore.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolveProject } from "../context";

const COURIER_DIR = ".courier/";
const GITIGNORE = ".gitignore";

/** Initialize project: ensure `.courier/` is ignored by git. */
export function initProject(): { gitignoreUpdated: boolean } {
  return { gitignoreUpdated: ensureGitignore() };
}

function ensureGitignore(): boolean {
  const gitignorePath = resolveProject(GITIGNORE);

  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `# Courier studio cache\n${COURIER_DIR}\n`, "utf-8");
    return true;
  }

  const content = readFileSync(gitignorePath, "utf-8");
  if (content.includes(COURIER_DIR)) return false;

  const separator = content.endsWith("\n") ? "" : "\n";
  const header = content.includes("# Courier studio cache") ? "" : "\n# Courier studio cache";
  writeFileSync(gitignorePath, `${content}${separator}${header}\n${COURIER_DIR}\n`, "utf-8");
  return true;
}
