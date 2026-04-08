/**
 * Default state and global open-trigger plumbing for the mock wizard.
 *
 * Holds:
 *  - the cross-component event bus + `openMockWizard` trigger
 *  - default port resolution (avoids clashing with already-running servers)
 *  - the factories that produce a fresh `MockGeneratorState`
 */

import { useMockStore } from "@/store/mock-slice";

import type { MockGeneratorOptions, MockGeneratorState } from "./types";

const BASE_PORT = 7001;

/** Event bus shared by `openMockWizard` and `useMockGenerator`. */
export const wizardBus = new EventTarget();

/** Open the mock generator wizard from anywhere in the studio UI. */
export function openMockWizard(): void {
  wizardBus.dispatchEvent(new Event("open"));
}

/** Find next available port by checking existing mock servers in the store. */
export function getNextAvailablePort(): number {
  const { servers } = useMockStore.getState();
  const usedPorts = new Set(Object.values(servers).map((s) => s.port));
  let port = BASE_PORT;
  while (usedPorts.has(port)) port++;
  return port;
}

/** Build the default options object for a fresh wizard session. */
export function buildDefaultOptions(): MockGeneratorOptions {
  return { outputDir: "mock-servers", port: getNextAvailablePort(), seedCount: 20 };
}

/** Build a fully reset wizard state (used by `openWizard`). */
export function buildInitialState(): MockGeneratorState {
  return {
    step: "source",
    selectedSources: [],
    standalone: false,
    options: buildDefaultOptions(),
    endpoints: {},
    sourceFilePaths: {},
    generatedFiles: [],
    writing: false,
  };
}
