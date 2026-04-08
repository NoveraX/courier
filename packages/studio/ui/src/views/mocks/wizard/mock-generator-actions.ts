/**
 * Pure state mutators for the mock generator wizard.
 *
 * Each function takes the current state and returns a new state — the
 * hook binds them to `setState` via thin `useCallback` wrappers.
 */

import type { MockGeneratorOptions, MockGeneratorState, MockWizardStep } from "./types";

export function applyStep(state: MockGeneratorState, step: MockWizardStep): MockGeneratorState {
  return { ...state, step };
}

export function applyToggleSource(state: MockGeneratorState, sourceName: string): MockGeneratorState {
  const selected = state.selectedSources.includes(sourceName)
    ? state.selectedSources.filter((n) => n !== sourceName)
    : [...state.selectedSources, sourceName];

  return {
    ...state,
    selectedSources: selected,
    standalone: false,
    options: { ...state.options, outputDir: "mock-servers" },
  };
}

export function applyStandalone(state: MockGeneratorState, standalone: boolean): MockGeneratorState {
  return {
    ...state,
    standalone,
    selectedSources: standalone ? [] : state.selectedSources,
  };
}

export function applyOptions(
  state: MockGeneratorState,
  patch: Partial<MockGeneratorOptions>,
): MockGeneratorState {
  return { ...state, options: { ...state.options, ...patch } };
}

export function applyToggleEndpoint(
  state: MockGeneratorState,
  source: string,
  group: string,
  endpoint: string,
): MockGeneratorState {
  const endpoints = structuredClone(state.endpoints);
  const groupEndpoints = endpoints[source]?.[group];
  if (!groupEndpoints) return state;
  const ep = groupEndpoints.find((e) => e.endpoint === endpoint);
  if (ep) ep.selected = !ep.selected;
  return { ...state, endpoints };
}

export function applyToggleGroup(
  state: MockGeneratorState,
  source: string,
  group: string,
): MockGeneratorState {
  const endpoints = structuredClone(state.endpoints);
  const groupEndpoints = endpoints[source]?.[group];
  if (!groupEndpoints) return state;
  const allSelected = groupEndpoints.every((e) => e.selected);
  for (const ep of groupEndpoints) {
    ep.selected = !allSelected;
  }
  return { ...state, endpoints };
}

export function applyToggleAll(state: MockGeneratorState): MockGeneratorState {
  const endpoints = structuredClone(state.endpoints);
  const allSelected = Object.values(endpoints)
    .flatMap((groups) => Object.values(groups))
    .flat()
    .every((e) => e.selected);

  for (const groups of Object.values(endpoints)) {
    for (const eps of Object.values(groups)) {
      for (const ep of eps) {
        ep.selected = !allSelected;
      }
    }
  }
  return { ...state, endpoints };
}
