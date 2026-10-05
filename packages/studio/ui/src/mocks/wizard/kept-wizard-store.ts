import { create } from "zustand";

import type { KeptWizard } from "@/features/mocks/wizard/kept-wizard";

/** The mock wizard left unfinished, kept in the project; `null` while there is none. */
export interface KeptWizardStore {
  kept: KeptWizard | null;
}

/**
 * The mock wizard left unfinished — its step and drafts — which it opens
 * at again, here or in another browser, until it is done.
 *
 * @example
 * ```ts
 * session.dispatch({ type: "open", resume: useKeptWizard.getState().kept ?? undefined });
 * ```
 */
export const useKeptWizard = create<KeptWizardStore>(() => ({ kept: null }));
