/**
 * Async operations and selection reducers for the import wizard.
 */

import type {
  ImportState,
  GenerateOptions,
  ParsedSpec,
} from "./types";
import {
  parseSpecFromUrl,
  parseSpecFromRaw,
  generateCode,
  writeFiles,
} from "./client";
import {
  selectAllEndpoints,
  buildDefaultOptions,
} from "./helpers";

import type { Settings } from "@/store/types-ui";

// ── Spec parsing ────────────────────────────────────────────────────────────

export async function parseSpec(
  source: "url" | "raw" | "file",
  content: string,
): Promise<ParsedSpec> {
  return source === "url"
    ? parseSpecFromUrl(content)
    : parseSpecFromRaw(content);
}

export function deriveSourceName(spec: ParsedSpec, url?: string): string {
  const fromTitle = sanitize(spec.title);
  if (isUsable(fromTitle)) return toCamelCase(fromTitle);

  const fromBaseURL = extractDomain(spec.baseURL);
  if (isUsable(fromBaseURL)) return toCamelCase(fromBaseURL);

  const fromUrl = extractDomain(url);
  if (isUsable(fromUrl)) return toCamelCase(fromUrl);

  return fromTitle || "api";
}

const SKIP_NAMES = new Set([
  "api", "docs", "public", "swagger", "openapi", "v1", "v2", "v3",
  "www", "app", "cdn", "static", "dev", "staging",
]);
const TLDS = new Set([
  "com", "org", "net", "io", "dev", "cloud", "app", "co", "me", "ru",
  "uk", "de", "fr", "jp", "us", "eu", "info", "biz", "xyz",
]);

function isUsable(name: string): boolean {
  return name.length > 1 && !SKIP_NAMES.has(name) && !TLDS.has(name);
}

function sanitize(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function extractDomain(url?: string): string {
  if (!url) return "";
  try {
    const parts = new URL(url).hostname.split(".");
    // Find the most meaningful part (skip TLDs and generic subdomains)
    for (let i = parts.length - 2; i >= 0; i--) {
      if (isUsable(parts[i])) return parts[i];
    }
  } catch { /* invalid URL */ }
  return "";
}

function toCamelCase(kebab: string): string {
  return kebab.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function buildPostParseState(
  spec: ParsedSpec,
  settings: Settings,
  sourceUrl?: string,
): Partial<ImportState> {
  const sourceName = deriveSourceName(spec, sourceUrl);
  return {
    step: "select",
    spec,
    options: buildDefaultOptions(sourceName, settings),
    selectedEndpoints: selectAllEndpoints(spec),
  };
}

// ── Code generation ─────────────────────────────────────────────────────────

export async function generatePreview(
  spec: ParsedSpec,
  options: GenerateOptions,
  selected: Record<string, string[]>,
): Promise<ImportState["generatedFiles"]> {
  const opts: GenerateOptions = { ...options, selectedEndpoints: selected };
  const { files } = await generateCode(spec, opts);
  return files;
}

// ── Write to disk ───────────────────────────────────────────────────────────

export async function writeGeneratedFiles(state: ImportState): Promise<unknown> {
  if (!state.spec) throw new Error("No spec to write");
  return writeFiles({
    sourceName: state.options.sourceName,
    spec: state.spec,
    specUrl: state.source === "url" ? state.content : "",
    importType: state.source,
    options: { ...state.options, selectedEndpoints: state.selectedEndpoints },
    files: state.generatedFiles,
  });
}

// ── Selection reducers ──────────────────────────────────────────────────────

export function toggleEndpointReducer(
  state: ImportState,
  group: string,
  endpoint: string,
): ImportState {
  const groupEps = state.selectedEndpoints[group] ?? [];
  const has = groupEps.includes(endpoint);
  return {
    ...state,
    selectedEndpoints: {
      ...state.selectedEndpoints,
      [group]: has
        ? groupEps.filter((e) => e !== endpoint)
        : [...groupEps, endpoint],
    },
  };
}

export function toggleGroupReducer(
  state: ImportState,
  groupName: string,
): ImportState {
  if (!state.spec) return state;
  const group = state.spec.groups.find((g) => g.name === groupName);
  if (!group) return state;
  const current = state.selectedEndpoints[groupName] ?? [];
  const allSelected = current.length === group.endpoints.length;
  return {
    ...state,
    selectedEndpoints: {
      ...state.selectedEndpoints,
      [groupName]: allSelected ? [] : group.endpoints.map((e) => e.name),
    },
  };
}

export function toggleAllReducer(state: ImportState): ImportState {
  if (!state.spec) return state;
  const total = state.spec.groups.reduce((n, g) => n + g.endpoints.length, 0);
  const selected = Object.values(state.selectedEndpoints).reduce((n, a) => n + a.length, 0);
  return {
    ...state,
    selectedEndpoints: selected === total ? {} : selectAllEndpoints(state.spec),
  };
}
