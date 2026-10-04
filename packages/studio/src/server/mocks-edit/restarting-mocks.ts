import { restartedByEdit } from "../mock-fingerprints";
import type { MocksEditContext } from "./mocks-edit-context";
import type { PreparedEdit } from "./prepare-edit";

/**
 * The running mocks a planned edit restarts: those whose declaration, or
 * what it uses, the edit changes. A file the edit creates runs none yet.
 *
 * @param ctx - The running Studio
 * @param prepared - The planned edit
 * @returns Their keys
 * @example
 * ```ts
 * const restarting = restartingMocks(ctx, prepared); // → ["users"]
 * ```
 */
export function restartingMocks(ctx: MocksEditContext, prepared: PreparedEdit): string[] {
  const { target, plan } = prepared;
  if (target.kind !== "existing") return [];
  const running = ctx
    .mockSummaries()
    .filter((mock) => mock.alive)
    .map((mock) => mock.key);
  return restartedByEdit({ file: target.path, before: target.text, after: plan.text, running });
}
