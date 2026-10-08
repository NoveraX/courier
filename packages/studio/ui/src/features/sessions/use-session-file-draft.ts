import { useEffect, useState } from "react";

import type { SessionFileDraft, SessionFileTarget } from "./session-file";
import { prepareSessionFile } from "./session-file";

/** Where a session file being looked over stands. */
export type DraftState =
  | { kind: "idle" }
  | { kind: "writing" }
  | { kind: "ready"; draft: SessionFileDraft }
  | { kind: "failed"; message: string };

/**
 * The session file Studio writes for the requests asked for, written again
 * each time they are asked for, so what is looked over is what is saved.
 *
 * @param target - The requests the file is made of, or `null` while none are asked for
 * @returns Where the file stands
 * @example
 * ```ts
 * const state = useSessionFileDraft(useSessionFileDialog((s) => s.target));
 * ```
 */
export function useSessionFileDraft(target: SessionFileTarget | null): DraftState {
  const [state, setState] = useState<DraftState>({ kind: "idle" });
  useEffect(() => {
    if (target === null) {
      setState({ kind: "idle" });
      return;
    }
    let current = true;
    setState({ kind: "writing" });
    async function write(asked: SessionFileTarget): Promise<void> {
      try {
        const draft = await prepareSessionFile(asked);
        if (current) setState({ kind: "ready", draft });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (current) setState({ kind: "failed", message });
      }
    }
    void write(target);
    return () => {
      current = false;
    };
  }, [target]);
  return state;
}
