import { codeMentions } from "../../apis/manage/code-mentions";
import { planImportRemovals } from "../../apis/manage/import-removals";
import { applyEdits } from "../mocks-edit/plan/apply-edits";
import { type ParsedSource, parseSource } from "../mocks-edit/plan/parse-source";
import type { TextEdit } from "../mocks-edit/types";
import { ConfigEditRefusal } from "./config-edit-refusal";
import type {
  ConfigUndeclarationInput,
  ConfigUndeclarationPlan,
} from "./config-undeclaration-types";
import { listEntryRemovals } from "./list-entry-removals";
import { parseConfigObject } from "./parse-config-object";
import { verifyConfigUndeclaration } from "./verify-config-undeclaration";

const LISTS = ["sources", "imports"] as const;

/**
 * Plan the change that takes an import out of the config: its entry under
 * `sources` and its entry under `imports`, each with its doc comment and its
 * comma, and the imports of names only those entries used. A `sources` left
 * empty reads `{}`, and an `imports` left empty goes. The config only ever
 * loses text, and the result is read back as a config that no longer
 * declares the import before it is returned. No filesystem is involved.
 *
 * @param input - The config as read, and what to take out
 * @returns The config as changed, and the removals that change it; `null` when the config writes out neither entry
 * @throws {ConfigEditRefusal} When Studio should leave the change to the developer
 * @example
 * ```ts
 * const plan = planConfigUndeclaration({
 *   configName: "courier.config.ts",
 *   text: 'import { api } from "./src/api";\nimport { pets } from "./src/api/pets/source";\nexport default { sources: { api, pets } };\n',
 *   name: "pets",
 *   source: true,
 *   importEntry: false,
 * });
 * plan?.text; // → 'import { api } from "./src/api";\nexport default { sources: { api } };\n'
 * ```
 */
export function planConfigUndeclaration(
  input: ConfigUndeclarationInput,
): ConfigUndeclarationPlan | null {
  const { configName, name } = input;
  const { parsed, config } = parseConfigObject(configName, input.text);
  const locals = new Set<string>();
  const entries = LISTS.filter((key) => (key === "sources" ? input.source : input.importEntry))
    .flatMap((key) => listEntryRemovals({ parsed, config, key, configName, name }, locals))
    .sort((a, b) => a.start - b.start);
  if (entries.length === 0) return null;
  const edits = [...entries, ...unusedImports(input, parsed, entries, locals)].sort(
    (a, b) => a.start - b.start,
  );
  if (edits.some((edit, at) => at > 0 && edit.start < (edits[at - 1]?.end ?? 0))) {
    throw new ConfigEditRefusal(
      "PLAN_REJECTED",
      `Studio planned removals from ${configName} that overlap, so it changed nothing.`,
    );
  }
  const text = applyEdits(input.text, edits);
  verifyConfigUndeclaration(text, input);
  return { text, edits };
}

/* Imports go only for the names nothing but the removed entries mentions. */
function unusedImports(
  input: ConfigUndeclarationInput,
  parsed: ParsedSource,
  entries: readonly TextEdit[],
  locals: ReadonlySet<string>,
): TextEdit[] {
  if (locals.size === 0) return [];
  const without = parseSource(input.configName, applyEdits(input.text, entries));
  if (without.problem !== null) {
    throw new ConfigEditRefusal(
      "PLAN_REJECTED",
      `Studio planned a change to ${input.configName} that does not parse, so it changed nothing.`,
    );
  }
  const mentions = codeMentions(without);
  return planImportRemovals(parsed, (name) => locals.has(name) && !mentions(name));
}
