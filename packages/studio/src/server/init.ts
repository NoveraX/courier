/**
 * Project initialization — ensures registry.nexus.json exists
 * and `.nexus/` directory is in .gitignore.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadRegistry, saveRegistry } from "../apis";
import { resolveProject } from "../context";

const NEXUS_DIR = ".nexus/";
const GITIGNORE = ".gitignore";

/** Initialize project: create registry if missing, update .gitignore */
export function initProject(): { registryCreated: boolean; gitignoreUpdated: boolean } {
  const registryCreated = ensureRegistry();
  const gitignoreUpdated = ensureGitignore();
  return { registryCreated, gitignoreUpdated };
}

function ensureRegistry(): boolean {
  if (existsSync(resolveProject("registry.nexus.json"))) return false;
  saveRegistry(loadRegistry());
  return true;
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
