import { create } from "zustand";

import type { SessionFileTarget } from "./session-file";

/**
 * The session file being looked over before it is saved, wherever it was
 * asked for — the Timeline, a saved session, the command palette — or
 * `null` while there is none.
 *
 * @example
 * ```ts
 * useSessionFileDialog.setState({ target: { kind: "shown" } });
 * ```
 */
export const useSessionFileDialog = create<{ target: SessionFileTarget | null }>(() => ({
  target: null,
}));

/**
 * Look over a session file of these requests before saving it.
 *
 * @param target - The requests the page shows, or a saved session
 * @example
 * ```ts
 * shareSessionFile({ kind: "saved", id: "3f2a9c1e" });
 * ```
 */
export function shareSessionFile(target: SessionFileTarget): void {
  useSessionFileDialog.setState({ target });
}
