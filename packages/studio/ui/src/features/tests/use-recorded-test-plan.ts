import { useEffect, useState } from "react";

import { savedRequestOf } from "@/features/sessions/saved-request";
import type { SessionFileTarget } from "@/features/sessions/session-file";
import { post } from "@/lib/api-client";
import { useStudioStore } from "@/store";
import { planOf, type RecordedTestPlan } from "./recorded-test-plan";

/* How long typing rests before the plan is asked again. */
const SETTLE_MS = 350;

/** Where planning a recorded test stands. */
export type PlanState =
  | { kind: "idle" }
  | { kind: "planning" }
  | { kind: "ready"; plan: RecordedTestPlan }
  | { kind: "failed"; message: string };

/** What a test is asked for with. */
export interface TestAsk {
  /** Empty for the session's own name */
  title: string;
  folder: string;
}

/**
 * The body of a plan or a write: the saved session asked for, or the one
 * the page shows, or else the live requests, with the title and folder.
 *
 * @param target - The requests the test is made of
 * @param ask - The title and the folder typed
 * @returns The body
 * @example
 * ```ts
 * await post("/api/tests/plan", testBody({ kind: "shown" }, { title: "", folder: "tests/recorded" }));
 * ```
 */
export function testBody(target: SessionFileTarget, ask: TestAsk): Record<string, unknown> {
  const { requests, shownSession } = useStudioStore.getState();
  const id = target.kind === "saved" ? target.id : shownSession?.id;
  return {
    ...(ask.title.trim() !== "" && { title: ask.title.trim() }),
    folder: ask.folder.trim(),
    ...(id === undefined ? { requests: requests.map(savedRequestOf) } : { id }),
  };
}

/**
 * The plan Studio makes for saving the requests as a test, asked again
 * once the title or the folder rests after typing, or when `again` changes.
 *
 * @param target - The requests, or `null` while none are being saved
 * @param ask - The title and the folder typed
 * @param again - Changed to ask for the plan again as it is
 * @returns Where the plan stands
 * @example
 * ```ts
 * const state = useRecordedTestPlan(target, { title, folder }, attempt);
 * ```
 */
export function useRecordedTestPlan(
  target: SessionFileTarget | null,
  ask: TestAsk,
  again: number,
): PlanState {
  const [state, setState] = useState<PlanState>({ kind: "idle" });
  const { title, folder } = ask;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `again` changes only to ask for the plan once more
  useEffect(() => {
    if (target === null) {
      setState({ kind: "idle" });
      return;
    }
    let current = true;
    setState({ kind: "planning" });
    const timer = setTimeout(async () => {
      try {
        const plan = planOf(
          await post<unknown>("/api/tests/plan", testBody(target, { title, folder })),
        );
        if (!current) return;
        setState(
          plan ? { kind: "ready", plan } : { kind: "failed", message: "Studio sent no plan" },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (current) setState({ kind: "failed", message });
      }
    }, SETTLE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [target, title, folder, again]);
  return state;
}
