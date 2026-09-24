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

import { relative } from "node:path";
import { extractSourceMap } from "@noverax/courier-studio-core";

import { getProjectRoot } from "../context";
import { loadCourierConfig } from "./config-loader";
import { findSourceDeclaration } from "./find-source-declaration";
import { getImportEntry, getImportState, loadImportsSnapshot } from "./imports-bridge";

/** How an endpoint is shaped, as the APIs page and mock wizard read it. */
export interface ScannedEndpointAnalysis {
  hasResponseType: boolean;
  hasVariablesType: boolean;
  hasValidation: boolean;
  httpMethod: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  type: "query" | "mutation" | null;
}

export interface ScannedEndpoint {
  name: string;
  analysis: ScannedEndpointAnalysis;
}

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
}

export interface ScanResult {
  sources: ScannedSource[];
  scannedFiles: number;
}

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

/** Endpoints a specification declared without a group are keyed under `""`. */
const FLAT_GROUP = "";

/**
 * Build the source catalogue for the project Studio was started in.
 *
 * @returns Every declared source; empty when the project has no config yet
 *
 * @example
 * ```ts
 * const { sources } = await scanProjectSources();
 * sources.map((s) => s.name); // → ["billing", "todoApi"]
 * ```
 */
export async function scanProjectSources(): Promise<ScanResult> {
  const root = getProjectRoot();
  const { config, configFile, deps } = await loadCourierConfig(root);
  const sourceMap = extractSourceMap(config.sources ?? {});

  const snapshot = await loadImportsSnapshot();

  const sources: ScannedSource[] = [];
  for (const [name, source] of Object.entries(sourceMap)) {
    const state = getImportState(snapshot, name);
    const written = state?.generatedFiles ?? [];
    const isImported = state !== undefined || getImportEntry(snapshot, name) !== undefined;
    const groups: ScannedGroup[] = [];
    let inlineEndpoints: ScannedEndpoint[] | undefined;

    for (const [groupName, group] of Object.entries(source.groups)) {
      const endpoints = Object.entries(group.endpoints).map(([endpointName, endpoint]) =>
        describeEndpoint(endpointName, endpoint),
      );
      if (groupName === FLAT_GROUP) {
        inlineEndpoints = endpoints;
        continue;
      }
      groups.push({
        name: groupName,
        prefix: group.prefix,
        filePath: written.find((file) => file.endsWith(`/${groupName}/index.ts`)) ?? "",
        endpoints,
      });
    }

    sources.push({
      name,
      baseURL: source.baseURL,
      filePath:
        written.find((file) => file.endsWith("/source.ts")) ??
        findSourceDeclaration(name, deps, root) ??
        relative(root, configFile),
      groups,
      ...(inlineEndpoints && { inlineEndpoints }),
      isImported,
      /* Studio writes the caller into the source's own `index.ts`; a source
         generated with `generateClient: "none"` has no such file. */
      hasClient: written.some((file) => /(^|\/)index\.ts$/.test(file) && !file.includes("/../")),
    });
  }

  return { sources, scannedFiles: sources.length };
}

type MapEndpoint = ReturnType<
  typeof extractSourceMap
>[string]["groups"][string]["endpoints"][string];

function describeEndpoint(name: string, endpoint: MapEndpoint): ScannedEndpoint {
  const method = endpoint.httpMethod?.toLowerCase();
  return {
    name,
    analysis: {
      hasResponseType: endpoint.hasResponseSchema,
      hasVariablesType: endpoint.hasVariablesSchema,
      hasValidation: endpoint.hasResponseSchema || endpoint.hasVariablesSchema,
      httpMethod:
        method && HTTP_METHODS.has(method)
          ? (method as ScannedEndpointAnalysis["httpMethod"])
          : "get",
      path: endpoint.path ?? "",
      type: endpoint.type ?? null,
    },
  };
}
