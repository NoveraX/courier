/**
 * Async operations and selection reducers for the import wizard.
 */

import { generateCode, parseSpecFromRaw, parseSpecFromUrl } from "@/apis/client";
import { type ImportBody, writeFiles } from "@/apis/client-file-changes";
import { deriveSourceName } from "@/features/apis/derive-source-name";
import { buildDefaultOptions, selectAllEndpoints } from "@/features/apis/helpers";
import { consentBody } from "@/features/apis/plan-consent";
import type { GenerateOptions, ImportState, ParsedSpec } from "@/features/apis/types";
import { ownValue } from "@/lib/own-value";
import type { Settings } from "@/store/types-ui";

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
  const options = buildDefaultOptions(sourceName, settings);
  /* By tag, an API that tags no operation is one group — Stripe's, a schemas file of megabytes. */
  if (spec.untagged && options.groupBy === "tag") options.groupBy = "path";
  return { step: "select", spec, options, selectedEndpoints: selectAllEndpoints(spec) };
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
  return writeFiles({ ...importBody(state), ...consentBody(state.consent) });
}

/**
 * The import as the wizard sends it to Studio: the spec, where it came
 * from, and the options with the endpoints picked. Writing it and declaring
 * it in courier.config both send it.
 *
 * @param state - The wizard's state
 * @returns The request body
 * @throws {Error} While no spec is parsed
 * @example
 * ```ts
 * await previewConfigDeclare(importBody(state));
 * ```
 */
export function importBody(state: ImportState): ImportBody {
  if (!state.spec) throw new Error("No spec to write");
  return {
    sourceName: state.options.sourceName,
    spec: state.spec,
    specUrl: state.source === "url" ? state.content : "",
    importType: state.source,
    options: { ...state.options, selectedEndpoints: state.selectedEndpoints },
  };
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
