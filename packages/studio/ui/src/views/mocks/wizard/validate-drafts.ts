import type { DraftErrors, MockDraft } from "./types";

import { DRAFT_LIMITS } from "./draft-limits";
import { keyRuleProblem } from "./key-rule-problem";
import { parseWholeNumber } from "./parse-whole-number";

/** What the project has, as the UI knows it, to check drafts against. */
export interface DraftProject {
  /** The keys under `sources` in the config Studio runs. */
  sourceKeys: readonly string[];
  /** The keys of the mocks Studio has declared. */
  declaredKeys: readonly string[];
}

/** The drafts before the one being checked: keys by lower-case form, and keys by fixed port. */
interface Earlier {
  keys: Map<string, string>;
  ports: Map<number, string>;
}

function keyProblem(key: string, earlier: Earlier, declared: ReadonlyMap<string, string>): string | undefined {
  const rule = keyRuleProblem(key);
  if (rule !== null) return rule;
  const repeated = earlier.keys.get(key.toLowerCase());
  if (repeated !== undefined) {
    return `another new mock is named "${repeated}"; keys must differ in more than letter case`;
  }
  const existing = declared.get(key.toLowerCase());
  return existing === undefined ? undefined : `a mock named ${existing} is already declared`;
}

function fixedPort(draft: MockDraft): number | null {
  return parseWholeNumber(draft.portText, DRAFT_LIMITS.minPort, DRAFT_LIMITS.maxPort);
}

function portProblem(draft: MockDraft, earlier: Earlier): string | undefined {
  if (draft.portMode === "auto") return undefined;
  const port = fixedPort(draft);
  if (port === null) return `a port must be a whole number from 1 to ${DRAFT_LIMITS.maxPort}`;
  const holder = earlier.ports.get(port);
  return holder === undefined ? undefined : `${holder} in this request already asks for port ${port}`;
}

function seedCountProblem(draft: MockDraft): string | undefined {
  const { minSeedCount, maxSeedCount } = DRAFT_LIMITS;
  if (parseWholeNumber(draft.seedCountText, minSeedCount, maxSeedCount) !== null) return undefined;
  return `records per collection must be a whole number from 1 to ${maxSeedCount}`;
}

function remember(draft: MockDraft, earlier: Earlier): void {
  const lower = draft.key.toLowerCase();
  if (!earlier.keys.has(lower)) earlier.keys.set(lower, draft.key);
  const port = draft.portMode === "fixed" ? fixedPort(draft) : null;
  if (port !== null && !earlier.ports.has(port)) earlier.ports.set(port, draft.key);
}

function withoutEmpty(errors: DraftErrors): DraftErrors | null {
  return Object.values(errors).some((message) => message !== undefined) ? errors : null;
}

/**
 * Check drafts as Studio will, so a problem shows next to its field while
 * typing: a source the config declares, a key by Studio's rules that no
 * other draft or declared mock has (ignoring letter case), a port and a
 * record count typed as whole numbers in range, and no fixed port asked for
 * twice. Studio stays the judge: it checks again, and its answer names the
 * field too.
 *
 * @param drafts - The drafts, in the order they are sent
 * @param project - The sources and mock keys Studio runs
 * @returns Each draft's problems by its position; a draft without any is absent
 *
 * @example
 * ```ts
 * const draft = { source: "api", key: "api", portMode: "fixed", portText: "", seedCountText: "20", autoStart: true } as const;
 * validateDrafts([draft], { sourceKeys: ["api"], declaredKeys: ["API"] });
 * // Map { 0 => { key: "a mock named API is already declared", port: "a port must be a whole number from 1 to 65535" } }
 * ```
 */
export function validateDrafts(
  drafts: readonly MockDraft[],
  project: DraftProject,
): Map<number, DraftErrors> {
  const sources = new Set(project.sourceKeys);
  const declared = new Map(project.declaredKeys.map((key) => [key.toLowerCase(), key]));
  const earlier: Earlier = { keys: new Map(), ports: new Map() };
  const problems = new Map<number, DraftErrors>();
  for (const [index, draft] of drafts.entries()) {
    const errors = withoutEmpty({
      source: sources.has(draft.source) ? undefined : `courier.config has no sources.${draft.source}`,
      key: keyProblem(draft.key, earlier, declared),
      port: portProblem(draft, earlier),
      seedCount: seedCountProblem(draft),
    });
    if (errors) problems.set(index, errors);
    remember(draft, earlier);
  }
  return problems;
}
