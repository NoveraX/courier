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
import type { SchemaField } from "@noverax/courier-studio-core";
import { extractSourceMap } from "@noverax/courier-studio-core";
import type { LoadedCourierConfig } from "./config-loader";
import { findSourceDeclaration } from "./find-source-declaration";
import { getImportEntry, getImportState, type ImportsSnapshot } from "./imports-bridge";
import { scannedFilePaths } from "./scanned-file-paths";

/** How an endpoint is shaped, as the APIs page and mock wizard read it. */
export interface ScannedEndpointAnalysis {
  hasResponseType: boolean;
  hasVariablesType: boolean;
  hasValidation: boolean;
  httpMethod: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  type: "query" | "mutation" | null;
  /** How a stream or a channel is carried; absent for plain HTTP. */
  transport?: "sse" | "ws";
  /** The source's middleware, in the order it runs. */
  middleware?: string[];
  /** The variables its schema describes, with a placeholder for each field. */
  variablesStub?: Record<string, unknown>;
  /** The fields its variables schema declares, with their types and whether each is required. */
  variablesFields?: SchemaField[];
  /** A channel whose messages from the client have a schema. */
  hasReceiveSchema?: true;
  /** A stream or a channel the app serves itself, rather than an upstream. */
  served?: true;
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
  /** Where the source's proxy routes are served, as `defineApi({ proxyPath })` sets them. */
  proxyPath?: ProxyPath;
}

export interface ScanResult {
  sources: ScannedSource[];
  scannedFiles: number;
}

const HTTP_METHODS: ReadonlyArray<ScannedEndpointAnalysis["httpMethod"]> = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
];

/** Endpoints a specification declared without a group are keyed under `""`. */
const FLAT_GROUP = "";

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
      httpMethod: HTTP_METHODS.find((known) => known === method) ?? "get",
      path: endpoint.path ?? "",
      type: endpoint.type ?? null,
      ...(endpoint.transport && { transport: endpoint.transport }),
      ...(endpoint.middleware?.length && { middleware: [...endpoint.middleware] }),
      ...(endpoint.variablesStub && { variablesStub: endpoint.variablesStub }),
      ...(endpoint.variablesFields && { variablesFields: endpoint.variablesFields }),
      ...(endpoint.hasReceiveSchema && { hasReceiveSchema: true as const }),
      ...(endpoint.served && { served: true as const }),
    },
  };
}
