/**
 * Describe the API sources a project declares, for the APIs page and the
 * mock-server wizard.
 *
 * Both read a catalogue of the project's own sources: every source with its
 * groups, its endpoints, and whether it came from an imported specification.
 * The catalogue is assembled from what the server already holds — the loaded
 * `courier.config.ts` and the imports registry — rather than by re-reading the
 * project's TypeScript.
 */

import { join, relative } from "node:path";
import type { ProxyPath } from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";
import { extractSourceMap } from "@noverax/courier-studio-core";
import { isTopLevel } from "../apis/parser/top-level";
import { agentMarks } from "./agent-marks";
import type { LoadedCourierConfig } from "./config-loader";
import { describeEndpoint, type ScannedEndpoint } from "./describe-endpoint";
import { findSourceDeclaration } from "./find-source-declaration";
import { getImportEntry, getImportState, type ImportsSnapshot } from "./imports-bridge";
import { pageMarks } from "./page-marks";
import { scannedFilePaths } from "./scanned-file-paths";

export interface ScannedGroup {
  name: string;
  prefix: string;
  filePath: string;
  endpoints: ScannedEndpoint[];
}

export interface ScannedSource {
  name: string;
  baseURL: string;
  filePath: string;
  groups: ScannedGroup[];
  inlineEndpoints?: ScannedEndpoint[];
  isImported: boolean;
  hasClient: boolean;
  /** Where the source's proxy routes are served, as `defineApi({ proxyPath })` sets them. */
  proxyPath?: ProxyPath;
}

export interface ScanResult {
  sources: ScannedSource[];
  scannedFiles: number;
}

/**
 * Build the source catalogue from the config Studio runs and the imports
 * state. Nothing is loaded: a hand-written source's file is found among the
 * modules that load already read.
 *
 * @param loaded - The config Studio runs, or `null` when it runs none
 * @param snapshot - Its import declarations, with the imports state as read now
 * @param root - The project root, symlinks resolved, that paths are relative to
 * @returns Every declared source; none when Studio runs no config
 *
 * @example
 * ```ts
 * const { sources } = buildSourceScan(loaded, importsSnapshotOf(loaded.config.imports, root), root);
 * sources.map((s) => s.name); // → ["billing", "todoApi"]
 * ```
 */
export function buildSourceScan(
  loaded: LoadedCourierConfig | null,
  snapshot: ImportsSnapshot,
  root: string,
): ScanResult {
  if (!loaded) return { sources: [], scannedFiles: 0 };
  const { config, configFile, deps, depHashes } = loaded;
  const sourceMap = extractSourceMap(config.sources ?? {});
  const marks = agentMarks(config);
  const pages = pageMarks(config.sources as Sources | undefined);

  const sources: ScannedSource[] = [];
  for (const [name, source] of Object.entries(sourceMap)) {
    const state = getImportState(snapshot, name);
    const written = Object.keys(state?.files ?? {});
    const paths = scannedFilePaths(snapshot, name, written);
    const entry = getImportEntry(snapshot, name);
    /* A source of an import's name is the import's only when the config loaded the generated file. */
    const generated = paths.generatedSource;
    const isImported =
      generated !== undefined && (depHashes.get(join(root, generated)) ?? null) !== null;
    const groups: ScannedGroup[] = [];
    let inlineEndpoints: ScannedEndpoint[] | undefined;

    for (const [groupName, group] of Object.entries(source.groups)) {
      const endpoints = Object.entries(group.endpoints).map(([endpointName, endpoint]) => {
        const call = `${name}.${isTopLevel(groupName) ? endpointName : `${groupName}.${endpointName}`}`;
        return describeEndpoint(endpointName, endpoint, {
          agent: marks.get(call),
          page: pages.get(call),
        });
      });
      if (isTopLevel(groupName)) {
        inlineEndpoints = endpoints;
        continue;
      }
      groups.push({
        name: groupName,
        prefix: group.prefix,
        filePath: paths.group(groupName),
        endpoints,
      });
    }

    sources.push({
      name,
      baseURL: source.baseURL,
      filePath:
        paths.source ?? findSourceDeclaration(name, deps, root) ?? relative(root, configFile),
      groups,
      ...(inlineEndpoints && { inlineEndpoints }),
      ...(source.proxyPath && { proxyPath: source.proxyPath }),
      isImported,
      /* Studio writes the caller into the import's own `index.ts` unless it
         is declared with `generateClient: "none"`. */
      hasClient:
        isImported && (entry ? entry.generateClient !== "none" : paths.index !== undefined),
    });
  }

  return { sources, scannedFiles: sources.length };
}
