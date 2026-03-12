/**
 * API Registry — CRUD operations for managing imported API sources.
 *
 * Persists to `registry.nexus.json` in the project root.
 * Stores user config + userModified list (fingerprints live in .nexus-cache.json).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveProject } from "../../context";
import type { GenerateOptions } from "../generator/types";
import type { ParsedSpec } from "../parser/types";
import type {
  PersistedGenerateOptions,
  RegistryConfig,
  RegistrySource,
  SpecImportType,
} from "./types";

const DEFAULT_CONFIG_PATH = "registry.nexus.json";
const SCHEMA_REF = "./node_modules/@noverax/nexus-devtools/registry.schema.json";

// ── Config I/O ──────────────────────────────────────────────────────────────

/** Load registry config from disk. Returns empty config if file doesn't exist. */
export function loadRegistry(configPath?: string): RegistryConfig {
  const filePath = resolveProject(configPath ?? DEFAULT_CONFIG_PATH);
  if (!existsSync(filePath)) {
    return { sources: {} };
  }
  const content = readFileSync(filePath, "utf-8");
  const parsed: unknown = JSON.parse(content);
  const obj = parsed as { sources?: unknown };

  /* Ignore legacy wizard-format files (sources as array instead of object) */
  if (!obj.sources || Array.isArray(obj.sources)) {
    return { sources: {} };
  }

  const { $schema: _, ...config } = parsed as RegistryConfig & { $schema?: string };
  return config;
}

/** Save registry config to disk. */
export function saveRegistry(config: RegistryConfig, configPath?: string): string {
  const filePath = resolveProject(configPath ?? DEFAULT_CONFIG_PATH);
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const output = { $schema: SCHEMA_REF, ...config };
  writeFileSync(filePath, `${JSON.stringify(output, null, 2)}\n`, "utf-8");
  return filePath;
}

// ── CRUD ────────────────────────────────────────────────────────────────────

/** Add or update a source in the registry after successful generation. */
export function addSource(
  config: RegistryConfig,
  name: string,
  spec: ParsedSpec,
  specUrl: string,
  importType: SpecImportType,
  options: GenerateOptions,
  endpointCount: number,
  userModified: string[] = [],
): RegistryConfig {
  const { selectedEndpoints: _, ...persistedOptions } = options;
  const source: RegistrySource = {
    specUrl: importType === "url" ? specUrl : "",
    importType,
    specHash: computeSpecHash(spec),
    outputDir: options.outputDir,
    options: { ...persistedOptions, selectedEndpoints: null },
    userModified,
    endpointCount,
  };

  return {
    ...config,
    sources: { ...config.sources, [name]: source },
  };
}

/** Remove a source from the registry. */
export function removeSource(config: RegistryConfig, name: string): RegistryConfig {
  const { [name]: _, ...rest } = config.sources;
  return { ...config, sources: rest };
}

/** Get a source by name. Returns undefined if not found. */
export function getSource(config: RegistryConfig, name: string): RegistrySource | undefined {
  return config.sources[name];
}

/** List all source names with summary info. */
export function listSources(config: RegistryConfig): SourceSummary[] {
  return Object.entries(config.sources).map(([name, source]) => ({
    name,
    specUrl: source.specUrl,
    importType: source.importType ?? "url",
    outputDir: source.outputDir,
    options: source.options,
    endpointCount: source.endpointCount,
  }));
}

export interface SourceSummary {
  name: string;
  specUrl: string;
  importType: SpecImportType;
  outputDir: string;
  options: PersistedGenerateOptions;
  endpointCount: number;
}

// ── Update Detection ────────────────────────────────────────────────────────

/** Compute a hash of the spec for change detection. */
export function computeSpecHash(spec: ParsedSpec): string {
  const content = JSON.stringify({
    title: spec.title,
    version: spec.version,
    groups: spec.groups,
    schemas: spec.schemas,
    securitySchemes: spec.securitySchemes,
  });
  return createHash("sha256").update(content).digest("hex").slice(0, 32);
}

/** Check if a new spec differs from the stored version. */
export function hasSpecChanged(source: RegistrySource, newSpec: ParsedSpec): boolean {
  return computeSpecHash(newSpec) !== source.specHash;
}

/** Update specHash and userModified for a source after re-generation. */
export function updateSource(
  config: RegistryConfig,
  name: string,
  specHash: string,
  endpointCount: number,
  userModified: string[] = [],
): RegistryConfig {
  const source = config.sources[name];
  if (!source) return config;

  return {
    ...config,
    sources: {
      ...config.sources,
      [name]: { ...source, specHash, endpointCount, userModified },
    },
  };
}
