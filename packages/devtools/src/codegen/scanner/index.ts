/**
 * Code scanner — discovers nexus API definitions in the project.
 */

import { getProjectRoot, resolveProjectSafe } from "../../context";
import { loadRegistry } from "../registry/registry";
import { extractImportedGroups, linkGroupsToSources, resolveGroup } from "./link-groups";
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
  /* Merge: explicit config > registry.nexus.json > defaults */
  const cfg: ScanConfig = {
    scanPaths: config.scanPaths ?? registry.scanPaths ?? DEFAULT_CONFIG.scanPaths,
    ignore: config.ignore ?? registry.scanIgnore ?? DEFAULT_CONFIG.ignore,
  };
  const importedNames = new Set(Object.keys(registry.sources ?? {}));

  const sourceMap = new Map<string, ScannedSource>();
  const groupsByImport = new Map<string, ScannedGroup[]>();
  let scannedFiles = 0;

  for (const scanPath of cfg.scanPaths) {
    const absPath = resolveProjectSafe(scanPath);
    const files = discoverFiles(absPath, cfg.ignore);
    scannedFiles += files.length;

    for (const file of files) {
      const content = readFileSafe(file);
      if (!content || !isNexusFile(content)) continue;

      const relPath = toRelative(file, getProjectRoot());
      processFile(content, relPath, sourceMap, groupsByImport);
    }
  }

  /* Link groups to their sources via import analysis */
  linkGroupsToSources(sourceMap, groupsByImport);

  /* Mark imported sources */
  for (const source of sourceMap.values()) {
    source.isImported = importedNames.has(source.name);
  }

  return {
    sources: [...sourceMap.values()],
    scannedFiles,
  };
}

function processFile(
  content: string,
  filePath: string,
  sourceMap: Map<string, ScannedSource>,
  groupsByImport: Map<string, ScannedGroup[]>,
): void {
  /* Check for defineApi() */
  const source = extractSource(content, filePath);
  if (source?.name) {
    sourceMap.set(source.name, source as ScannedSource);
    /* Collect imported group variable names */
    const imports = extractImportedGroups(content);
    groupsByImport.set(
      source.name,
      imports.map((name) => ({
        name,
        prefix: "",
        filePath: "",
        endpoints: [],
      })),
    );
  }

  /* Check for all defineGroup() calls in file */
  const groups = extractGroups(content, filePath);
  for (const group of groups) {
    resolveGroup(group, sourceMap, groupsByImport, filePath);
  }
}
