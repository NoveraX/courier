import { useCallback, useEffect, useState } from "react";
import { type ConfigDeclare, readConfigDeclare } from "@/features/apis/config-declare";
import type { ImportState } from "@/features/apis/types";
import { applyConfigDeclare, previewConfigDeclare } from "./client-config-declare";
import { importBody } from "./import-actions";

/** Declaring a written import in courier.config, from the wizard's last step. */
export interface UseConfigDeclare {
  /** Studio's latest answer; `null` while the preview is on its way or failed. */
  answer: ConfigDeclare | null;
  /** Why asking Studio failed, when it did. */
  error: string | null;
  /** Whether Studio is making the change. */
  applying: boolean;
  /** Make the change the preview shows. */
  apply: () => Promise<void>;
}

const UNREAD = "Studio answered in a way this page does not read.";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Studio could not be reached.";
}

/**
 * Ask Studio, once the wizard has written an import and the config still
 * lacks part of its declaration, what declaring it would change in
 * courier.config — and make that change when asked. A new write asks anew.
 *
 * @param state - The wizard's state
 * @returns The answer, and how to apply it
 * @example
 * ```ts
 * const declare = useConfigDeclare(wizard.state);
 * declare.answer?.status === "ready" && <Button onClick={() => void declare.apply()} />;
 * ```
 */
export function useConfigDeclare(state: ImportState): UseConfigDeclare {
  const [answer, setAnswer] = useState<ConfigDeclare | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const written = state.step === "declare" ? state.declaration : null;
  const body = state.spec ? importBody(state) : null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: asked once per write — `written` is new only then, and the body is the one that write sent
  useEffect(() => {
    setAnswer(null);
    setError(null);
    if (written === null || body === null) return;
    let live = true;
    previewConfigDeclare(body).then(
      (raw) => {
        if (!live) return;
        const read = readConfigDeclare(raw);
        if (read) setAnswer(read);
        else setError(UNREAD);
      },
      (err: unknown) => live && setError(messageOf(err)),
    );
    return () => {
      live = false;
    };
  }, [written]);

  const apply = useCallback(async () => {
    if (answer?.status !== "ready" || body === null) return;
    setApplying(true);
    setError(null);
    try {
      const read = readConfigDeclare(await applyConfigDeclare(body, answer.baseHash));
      if (read) setAnswer(read);
      else setError(UNREAD);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setApplying(false);
    }
  }, [answer, body]);

  return { answer, error, applying, apply };
}
