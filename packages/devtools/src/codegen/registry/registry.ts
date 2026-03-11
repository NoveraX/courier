/**
 * API Registry — CRUD operations for managing imported API sources.
 *
 * Persists to `codegen.nexus.json` in the project root.
 * Tracks spec versions, fingerprints, sync status, and cached specs.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { GenerateOptions } from "../generator/types";
import type { ParsedSpec } from "../parser/types";
import type { EndpointFingerprint, RegistryConfig, RegistrySource, SpecSource } from "./types";

const DEFAULT_CONFIG_PATH = "codegen.nexus.json";

// ── Config I/O ──────────────────────────────────────────────────────────────

/** Load registry config from disk. Returns empty config if file doesn't exist. */
export function loadRegistry(configPath?: string): RegistryConfig {
  const filePath = resolve(configPath ?? DEFAULT_CONFIG_PATH);
  if (!existsSync(filePath)) {
    return { sources: {} };
  }
  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(content) as RegistryConfig;
}

/** Save registry config to disk. */
export function saveRegistry(config: RegistryConfig, configPath?: string): string {
  const filePath = resolve(configPath ?? DEFAULT_CONFIG_PATH);
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  return filePath;
}

// ── CRUD ────────────────────────────────────────────────────────────────────

/** Add or update a source in the registry after successful generation. */
export function addSource(
  config: RegistryConfig,
  name: string,
  spec: ParsedSpec,
  specSource: SpecSource,
  options: GenerateOptions,
  fingerprints: Record<string, EndpointFingerprint>,
): RegistryConfig {
  const source: RegistrySource = {
    specSource,
    specHash: computeSpecHash(spec),
    specVersion: spec.version,
    lastSynced: new Date().toISOString(),
    outputDir: options.outputDir,
    options,
    endpoints: fingerprints,
    cachedSpec: spec,
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
    version: source.specVersion,
    specSource: source.specSource,
    outputDir: source.outputDir,
    lastSynced: source.lastSynced,
    endpointCount: Object.keys(source.endpoints).length,
    modifiedCount: Object.values(source.endpoints).filter((e) => e.userModified).length,
  }));
}

export interface SourceSummary {
  name: string;
  version: string;
  specSource: SpecSource;
  outputDir: string;
  lastSynced: string;
  endpointCount: number;
  modifiedCount: number;
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

/** Update fingerprints for a source after re-generation. */
export function updateFingerprints(
  config: RegistryConfig,
  name: string,
  fingerprints: Record<string, EndpointFingerprint>,
  newSpec: ParsedSpec,
): RegistryConfig {
  const source = config.sources[name];
  if (!source) return config;

  const updated: RegistrySource = {
    ...source,
    specHash: computeSpecHash(newSpec),
    specVersion: newSpec.version,
    lastSynced: new Date().toISOString(),
    endpoints: fingerprints,
    cachedSpec: newSpec,
  };

  return {
    ...config,
    sources: { ...config.sources, [name]: updated },
  };
}
