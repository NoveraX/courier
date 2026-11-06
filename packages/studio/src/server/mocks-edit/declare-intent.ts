import type { LoadedCourierConfig } from "../config-loader";
import type { PlanFormatting } from "../import-files/file-plan-types";
import type { EditIntent } from "./edit-intent";
import { editWarnings } from "./edit-warnings";
import type { MocksTarget } from "./inspect-mocks-target";
import type { MocksEditContext } from "./mocks-edit-context";
import { buildMocksSnippet } from "./plan/mocks-snippet";
import type { PlanInput } from "./plan/types";
import { rejectionOf } from "./rejection-of";

/** What declaring mocks is planned with. */
export interface DeclarePlanning {
  /** The project root, symlinks resolved. */
  root: string;
  loaded: LoadedCourierConfig;
  target: MocksTarget;
  input: PlanInput;
  formatting: PlanFormatting | null;
  creates: boolean;
}

/**
 * What declaring mocks sets out to do: the mocks it adds, the snippet that
 * adds them by hand, what a load of it must show — each mock declared,
 * serving the config's source, and none lost — and what its preview warns
 * of: a file it creates, how it is formatted, the mocks it restarts, the
 * ports.
 *
 * @param ctx - The running Studio
 * @param planning - The edit, as planned
 * @returns The intent
 * @example
 * ```ts
 * const intent = declareIntent(ctx, { root, loaded, target, input, formatting, creates: plan.creates });
 * ```
 */
export function declareIntent(ctx: MocksEditContext, planning: DeclarePlanning): EditIntent {
  const { root, loaded, target, input, formatting, creates } = planning;
  const keys = input.requests.map((request) => request.key);
  return {
    keys,
    snippet: buildMocksSnippet(input),
    did: `added ${keys.join(", ")} to`,
    rejection: (before, after) => rejectionOf(before, after, input.requests, target.path, root),
    warnings: (restarting) =>
      editWarnings({
        requests: input.requests,
        loaded,
        summaries: ctx.mockSummaries(),
        target: target.relative,
        restarting,
        creates,
        formatting,
        mockBasePort: ctx.mockBasePort(),
      }),
  };
}
