import type { ObjectExpression } from "oxc-parser";
import { applyEdits } from "../mocks-edit/plan/apply-edits";
import { isPureInsertion } from "../mocks-edit/plan/is-pure-insertion";
import { planListInsertion } from "../mocks-edit/plan/list-insertion";
import type { TextEdit } from "../mocks-edit/types";
import type { ConfigDeclarationInput, ConfigDeclarationPlan } from "./config-declaration-types";
import { ConfigEditRefusal } from "./config-edit-refusal";
import { findConfigList } from "./find-config-list";
import { importLine, type ListTarget, listOf, listTargetOf, mergeInsertions } from "./list-site";
import { parseConfigObject } from "./parse-config-object";
import { importEntry, objectEntry, type RenderEntry, sourceEntry } from "./render-config-entries";
import { verifyConfigPlan } from "./verify-config-plan";

/** Where a declaration goes in a config, and how the config is written. */
interface Target extends ListTarget {
  input: ConfigDeclarationInput;
  config: ObjectExpression;
}

/**
 * Plan the change that declares an import in the config: the import of the
 * generated source after the config's last import, the source under
 * `sources`, and the import's entry under `imports` — each appended to the
 * object already there, or added to the config as a new key, written as the
 * config around it is. The config only ever gains text, and the result is
 * read back as a config before it is returned. No filesystem is involved.
 *
 * @param input - The config as read, and what to declare
 * @returns The config as changed, and the insertions that change it
 * @throws {ConfigEditRefusal} When Studio should leave the declaration to the developer
 * @example
 * ```ts
 * const plan = planConfigDeclaration({
 *   configName: "courier.config.ts",
 *   text: 'import { api } from "./src/api";\nexport default { sources: { api } };\n',
 *   name: "billing",
 *   source: { binding: "billing", specifier: "./src/api/billing/source" },
 * });
 * plan.text; // → 'import { api } from "./src/api";\nimport { billing } from …'
 * ```
 */
export function planConfigDeclaration(input: ConfigDeclarationInput): ConfigDeclarationPlan {
  const target = targetOf(input);
  const edits: TextEdit[] = [];
  const added: RenderEntry[] = [];
  const { source, importEntry: entry, name } = input;
  if (source) {
    edits.push(importLine(target, input.configName, source));
    const render: RenderEntry = () => sourceEntry(name, source.binding, target.style);
    edits.push(...addTo(target, "sources", render, added));
  }
  if (entry) edits.push(...addTo(target, "imports", importEntry(name, entry, target.style), added));
  if (added.length > 0) {
    const render = (indent: string, block: boolean) => added.map((r) => r(indent, block));
    edits.push(...planListInsertion(listOf(target.config), target.site, render));
  }
  const merged = mergeInsertions(edits);
  const text = applyEdits(input.text, merged);
  if (!isPureInsertion(input.text, text, merged)) {
    throw new ConfigEditRefusal(
      "PLAN_REJECTED",
      `Studio planned a change to ${input.configName} that was not only added lines, so it changed nothing.`,
    );
  }
  verifyConfigPlan(text, input);
  return { text, edits: merged };
}

function targetOf(input: ConfigDeclarationInput): Target {
  const { parsed, config } = parseConfigObject(input.configName, input.text);
  return { input, config, ...listTargetOf(parsed, config) };
}

/* An entry goes into the object the config declares under the key, or —
   when the config has none — into a new key the caller adds once. An entry
   the object writes out already is left as it is. */
function addTo(
  target: Target,
  key: "sources" | "imports",
  render: RenderEntry,
  added: RenderEntry[],
): TextEdit[] {
  const { config, parsed, site, style, input } = target;
  const list = findConfigList(config, key, parsed.program);
  if (list.kind === "other") {
    throw new ConfigEditRefusal("LIST_SHAPE", `${input.configName} ${list.what}.`);
  }
  if (list.kind === "absent") {
    added.push(objectEntry(key, [render], style));
    return [];
  }
  if (list.keys.has(input.name)) return [];
  return planListInsertion(listOf(list.object), site, (indent, block) => [render(indent, block)]);
}
