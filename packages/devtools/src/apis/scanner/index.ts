/**
 * Code scanner — discovers nexus API definitions in the project.
 *
 * Two-pass scan: first discover all sources (defineApi), then resolve groups (defineGroup).
 * This ensures groups are linked to their sources regardless of file processing order.
 */

import { getProjectRoot, resolveProjectSafe } from "../../context";
import { loadRegistry } from "../registry/registry";
import { extractImportedGroups, linkGroupsToSources, resolveGroup } from "./link-groups";
import { stripComments } from "./parse-utils";
import { discoverFiles, readFileSafe, toRelative } from "./scan-files";
import { extractGroups, extractSource, isNexusFile } from "./scan-source";
import type { ScanConfig, ScannedGroup, ScannedSource, ScanResult } from "./types";

export type {
  EndpointAnalysis,
  ScanConfig,
  ScannedEndpoint,
  ScannedGroup,
  ScannedSource,
  ScanResult,
} from "./types";

const DEFAULT_CONFIG: ScanConfig = {
  scanPaths: ["src/api"],
  ignore: ["node_modules", "dist", "lib", ".next", ".nuxt", ".output", ".turbo"],
};

/** Scan project directories for nexus API definitions */
export function scanProject(config: Partial<ScanConfig> = {}): ScanResult {
  const registry = loadRegistry();
  const cfg: ScanConfig = {
    scanPaths: config.scanPaths ?? registry.scanPaths ?? DEFAULT_CONFIG.scanPaths,
    ignore: config.ignore ?? registry.scanIgnore ?? DEFAULT_CONFIG.ignore,
  };
  const importedNames = new Set(Object.keys(registry.sources ?? {}));

  const sourceMap = new Map<string, ScannedSource>();
  const groupsByImport = new Map<string, ScannedGroup[]>();

  // Collect all nexus files first
  const nexusFiles: Array<{ content: string; relPath: string }> = [];

  for (const scanPath of cfg.scanPaths) {
    const absPath = resolveProjectSafe(scanPath);
    const files = discoverFiles(absPath, cfg.ignore);

    for (const file of files) {
      const raw = readFileSafe(file);
      if (!raw || !isNexusFile(raw)) continue;
      nexusFiles.push({ content: stripComments(raw), relPath: toRelative(file, getProjectRoot()) });
    }
  }

  // Pass 1: register all sources (defineApi) and create import placeholders
  for (const { content, relPath } of nexusFiles) {
    registerSource(content, relPath, sourceMap, groupsByImport);
  }

  // Pass 2: resolve all groups (defineGroup) — placeholders already exist
  for (const { content, relPath } of nexusFiles) {
    const groups = extractGroups(content, relPath);
    for (const group of groups) {
      resolveGroup(group, sourceMap, groupsByImport, relPath);
    }
  }

  // Link remaining groups to sources
  linkGroupsToSources(sourceMap, groupsByImport);

  // Mark imported sources
  for (const source of sourceMap.values()) {
    source.isImported = importedNames.has(source.name);
  }

  return {
    sources: [...sourceMap.values()],
    scannedFiles: nexusFiles.length,
  };
}

function registerSource(
  content: string,
  filePath: string,
  sourceMap: Map<string, ScannedSource>,
  groupsByImport: Map<string, ScannedGroup[]>,
): void {
  const source = extractSource(content, filePath);
  if (!source?.name) return;

  const validated: ScannedSource = {
    name: source.name,
    baseURL: source.baseURL ?? "",
    filePath: source.filePath ?? filePath,
    groups: source.groups ?? [],
    isImported: source.isImported ?? false,
    hasClient: source.hasClient ?? false,
    inlineEndpoints: source.inlineEndpoints,
  };

  sourceMap.set(validated.name, validated);
  const imports = extractImportedGroups(content);
  groupsByImport.set(
    validated.name,
    imports.map((name) => ({ name, prefix: "", filePath: "", endpoints: [] })),
  );
}
