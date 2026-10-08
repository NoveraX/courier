import { create } from "zustand";

import type { SessionFileTarget } from "@/features/sessions/session-file";

/**
 * The requests being saved as a test, wherever that was asked — the
 * Timeline, a saved session, the command palette — or `null` while none are.
 *
 * @example
 * ```ts
 * useRecordedTestDialog.setState({ target: { kind: "shown" } });
 * ```
 */
export const useRecordedTestDialog = create<{ target: SessionFileTarget | null }>(() => ({
  target: null,
}));

/**
 * Save these requests as a test: Studio plans the recordings and the
 * vitest file, checks the calls, and writes them once the person agrees.
 *
 * @param target - The requests the page shows, or a saved session
 * @example
 * ```ts
 * saveAsTest({ kind: "saved", id: "3f2a9c1e" });
 * ```
 */
export function saveAsTest(target: SessionFileTarget): void {
  useRecordedTestDialog.setState({ target });
}
