import { DRAFT_LIMITS } from "./draft-limits";
import { fixturesFileOf } from "./fixtures-file-of";
import { parseWholeNumber } from "./parse-whole-number";
import type { MockDraft } from "./types";
import type { MockDeclaration } from "./wire-types";

function toDeclaration(draft: MockDraft): MockDeclaration | null {
  const { minPort, maxPort, minSeedCount, maxSeedCount } = DRAFT_LIMITS;
  const seedCount = parseWholeNumber(draft.seedCountText, minSeedCount, maxSeedCount);
  const port =
    draft.portMode === "auto" ? null : parseWholeNumber(draft.portText, minPort, maxPort);
  if (seedCount === null || (draft.portMode === "fixed" && port === null)) return null;
  return {
    key: draft.key,
    source: draft.source,
    port,
    seedCount,
    autoStart: draft.autoStart,
    ...(draft.answers === "some" && { endpoints: [...draft.endpoints] }),
    ...(draft.data === "recorded" && { fixtures: fixturesFileOf(draft.key) }),
  };
}

/**
 * The declarations Studio is asked for, one per draft in order: an
 * automatic port is sent as `null` for Studio to assign, and the numbers
 * typed are sent as numbers.
 *
 * @param drafts - The drafts, checked by `validateDrafts`
 * @returns The declarations, or `null` when a number typed is not one in range
 *
 * @example
 * ```ts
 * toDeclarations([{ source: "api", key: "api", portMode: "auto", portText: "", seedCountText: "20", autoStart: true }]);
 * // → [{ key: "api", source: "api", port: null, seedCount: 20, autoStart: true }]
 * ```
 */
export function toDeclarations(drafts: readonly MockDraft[]): MockDeclaration[] | null {
  const declarations: MockDeclaration[] = [];
  for (const draft of drafts) {
    const declaration = toDeclaration(draft);
    if (declaration === null) return null;
    declarations.push(declaration);
  }
  return declarations;
}
