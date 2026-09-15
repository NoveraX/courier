/**
 * Project initialization — ensures `.nexus/` is in `.gitignore`.
 *
 * The imports-state file materializes itself on first write, so no registry
 * bootstrap step is required anymore.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolveProject } from "../context";

const NEXUS_DIR = ".nexus/";
const GITIGNORE = ".gitignore";

/** Initialize project: ensure `.nexus/` is ignored by git. */
export function initProject(): { registryCreated: boolean; gitignoreUpdated: boolean } {
  const gitignoreUpdated = ensureGitignore();
  return { registryCreated: false, gitignoreUpdated };
}

function ensureGitignore(): boolean {
  const gitignorePath = resolveProject(GITIGNORE);

  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `# Nexus studio cache\n${NEXUS_DIR}\n`, "utf-8");
    return true;
  }

  const content = readFileSync(gitignorePath, "utf-8");
  if (content.includes(NEXUS_DIR)) return false;

  const separator = content.endsWith("\n") ? "" : "\n";
  const header = content.includes("# Nexus studio cache") ? "" : "\n# Nexus studio cache";
  writeFileSync(gitignorePath, `${content}${separator}${header}\n${NEXUS_DIR}\n`, "utf-8");
  return true;
}
