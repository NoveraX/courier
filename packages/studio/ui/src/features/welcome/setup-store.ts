import { create } from "zustand";

import { isWelcomeCompleted, markWelcomeCompleted } from "./welcome-storage";

/** The setup a page walks through: the framework picked, the snippets copied, and whether it is done. */
export interface SetupState {
  frameworkId: string | null;
  /** The steps whose command or snippet was copied. */
  copied: ReadonlySet<string>;
  /** Whether the setup was finished, or a runtime attached: Get started then steps aside. */
  completed: boolean;
  /** Pick a framework; its steps start afresh. */
  select: (frameworkId: string) => void;
  markCopied: (stepId: string) => void;
  /** Finish the setup. */
  complete: () => void;
}

/**
 * The setup in progress, for the Welcome page and the sidebar's progress.
 * It is kept in the project, so another browser, or a page that reloads,
 * picks it up where it was; the page's browser keeps whether it is done,
 * so a page that opens knows before Studio says.
 *
 * @example
 * ```ts
 * const { done, total } = setupProgress(framework, useSetupStore.getState().copied, attached);
 * ```
 */
export const useSetupStore = create<SetupState>((set) => ({
  frameworkId: null,
  copied: new Set<string>(),
  completed: isWelcomeCompleted(),
  select: (frameworkId) =>
    set((state) =>
      state.frameworkId === frameworkId ? state : { frameworkId, copied: new Set<string>() },
    ),
  markCopied: (stepId) => set((state) => ({ copied: new Set(state.copied).add(stepId) })),
  complete: () => {
    markWelcomeCompleted();
    set({ completed: true });
  },
}));
