import { create } from "zustand";

/** The setup a page walks through: the framework picked, and the snippets copied. */
export interface SetupState {
  frameworkId: string | null;
  /** The steps whose command or snippet was copied. */
  copied: ReadonlySet<string>;
  /** Pick a framework; its steps start afresh. */
  select: (frameworkId: string) => void;
  markCopied: (stepId: string) => void;
}

/**
 * The setup in progress, for the Welcome page and the sidebar's progress.
 * It lasts while the page is open: a reload, or a runtime that attaches,
 * ends the need for it.
 *
 * @example
 * ```ts
 * const { done, total } = setupProgress(framework, useSetupStore.getState().copied, attached);
 * ```
 */
export const useSetupStore = create<SetupState>((set) => ({
  frameworkId: null,
  copied: new Set<string>(),
  select: (frameworkId) =>
    set((state) =>
      state.frameworkId === frameworkId ? state : { frameworkId, copied: new Set<string>() },
    ),
  markCopied: (stepId) => set((state) => ({ copied: new Set(state.copied).add(stepId) })),
}));
