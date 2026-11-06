import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { DeclareApplyResult, DeclarePreview } from "@/features/mocks/wizard/wire-types";
import { type EndpointsAsked, endpointsClient } from "./endpoints-client";

/** Where adding endpoints to a mock stands. */
export type AddToMockState =
  | { step: "closed" }
  | { step: "planning"; asked: EndpointsAsked }
  | { step: "planned"; asked: EndpointsAsked; plan: DeclarePreview; stale: boolean }
  | { step: "applying"; asked: EndpointsAsked; plan: DeclarePreview }
  | { step: "ended"; asked: EndpointsAsked; result: DeclareApplyResult }
  | { step: "failed"; asked: EndpointsAsked; message: string };

/** What adding endpoints to a mock is driven by. */
export interface AddToMock {
  state: AddToMockState;
  /** Plan adding these endpoints to the mock, and show the plan. */
  open(asked: EndpointsAsked): void;
  /** Make the change the plan shows. */
  apply(): void;
  close(): void;
}

/* Where adding stands once Studio did not answer. */
function failed(asked: EndpointsAsked, error: unknown): AddToMockState {
  return { step: "failed", asked, message: error instanceof Error ? error.message : String(error) };
}

/**
 * Add endpoints to the list a mock answers: Studio plans the edit of
 * `courier.mocks.ts`, the plan is shown — its diff, or why it is left to
 * be made by hand — and the change is made only as shown. A plan the
 * project outdated meanwhile is shown again, marked so; once the change is
 * made, Studio restarts the mock and the page says so.
 *
 * @returns The state, and what moves it
 * @example
 * ```ts
 * const add = useAddToMock();
 * add.open({ key: "shop", endpoints: ["orders.refund"] });
 * ```
 */
export function useAddToMock(): AddToMock {
  const [state, setState] = useState<AddToMockState>({ step: "closed" });
  const open = useCallback((asked: EndpointsAsked) => {
    setState({ step: "planning", asked });
    endpointsClient.preview(asked).then(
      (plan) => setState({ step: "planned", asked, plan, stale: false }),
      (error: unknown) => setState(failed(asked, error)),
    );
  }, []);
  const apply = useCallback(() => {
    if (state.step !== "planned" || state.plan.status !== "ready") return;
    const { asked, plan } = state;
    setState({ step: "applying", asked, plan });
    endpointsClient.apply({ ...asked, baseHash: plan.baseHash, planDigest: plan.planDigest }).then(
      (result) => {
        if (result.status === "stale") {
          setState({ step: "planned", asked, plan: result.plan, stale: true });
          return;
        }
        if (result.status === "applied") {
          const names =
            asked.endpoints.length === 1
              ? asked.endpoints[0]
              : `${asked.endpoints.length} endpoints`;
          toast.success(`${asked.key} answers ${names} now`);
          setState({ step: "closed" });
          return;
        }
        setState({ step: "ended", asked, result });
      },
      (error: unknown) => setState(failed(asked, error)),
    );
  }, [state]);
  const close = useCallback(() => setState({ step: "closed" }), []);
  return { state, open, apply, close };
}
