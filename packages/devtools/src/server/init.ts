/**
 * Project initialization — ensures registry.nexus.json exists
 * and .nexus-cache.json is in .gitignore.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadRegistry, saveRegistry } from "../codegen";
import { resolveProject } from "../context";

const CACHE_FILES = [".nexus-cache.json", ".nexus-digests.json"];
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
    writeFileSync(gitignorePath, `# Nexus devtools cache\n${CACHE_FILES.join("\n")}\n`, "utf-8");
    return true;
  }

  const content = readFileSync(gitignorePath, "utf-8");
  const missing = CACHE_FILES.filter((f) => !content.includes(f));
  if (missing.length === 0) return false;

  const separator = content.endsWith("\n") ? "" : "\n";
  const header = content.includes("# Nexus devtools cache") ? "" : "\n# Nexus devtools cache";
  writeFileSync(gitignorePath, `${content}${separator}${header}\n${missing.join("\n")}\n`, "utf-8");
  return true;
}
