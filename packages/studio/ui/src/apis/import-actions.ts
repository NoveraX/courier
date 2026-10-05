/**
 * Async operations and selection reducers for the import wizard.
 */

import { generateCode, parseSpecFromRaw, parseSpecFromUrl } from "@/apis/client";
import { writeFiles } from "@/apis/client-file-changes";
import { deriveSourceName } from "@/features/apis/derive-source-name";
import { buildDefaultOptions, selectAllEndpoints } from "@/features/apis/helpers";
import { consentBody } from "@/features/apis/plan-consent";
import { ownValue } from "@/lib/own-value";
import type { Settings } from "@/store/types-ui";
import type { GenerateOptions, ImportState, ParsedSpec } from "@/views/apis/types";

// ── Spec parsing ────────────────────────────────────────────────────────────

export async function parseSpec(
  source: "url" | "raw" | "file",
  content: string,
): Promise<ParsedSpec> {
  return source === "url" ? parseSpecFromUrl(content) : parseSpecFromRaw(content);
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

/**
 * Ask Studio to write the import. Studio generates the files itself; once
 * it has shown a plan, the request quotes it with the steps the user allowed.
 *
 * @param state - The wizard's state
 * @returns Studio's answer
 * @throws {StudioRequestError} When Studio will not apply the plan unasked, with the plan
 */
export async function writeGeneratedFiles(state: ImportState): Promise<unknown> {
  if (!state.spec) throw new Error("No spec to write");
  return writeFiles({
    sourceName: state.options.sourceName,
    spec: state.spec,
    specUrl: state.source === "url" ? state.content : "",
    importType: state.source,
    options: { ...state.options, selectedEndpoints: state.selectedEndpoints },
    ...consentBody(state.consent),
  });
}

// ── Selection reducers ──────────────────────────────────────────────────────

export function toggleEndpointReducer(
  state: ImportState,
  group: string,
  endpoint: string,
): ImportState {
  const groupEps = ownValue(state.selectedEndpoints, group) ?? [];
  const has = groupEps.includes(endpoint);
  return {
    ...state,
    selectedEndpoints: {
      ...state.selectedEndpoints,
      [group]: has ? groupEps.filter((e) => e !== endpoint) : [...groupEps, endpoint],
    },
  };
}

export function toggleGroupReducer(state: ImportState, groupName: string): ImportState {
  if (!state.spec) return state;
  const group = state.spec.groups.find((g) => g.name === groupName);
  if (!group) return state;
  const current = ownValue(state.selectedEndpoints, groupName) ?? [];
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
