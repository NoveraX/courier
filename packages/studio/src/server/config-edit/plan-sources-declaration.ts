import { type ParsedSource, parseSource } from "@noverax/courier-cli/devkit";
import type { Directive, ObjectExpression, Program, Statement } from "oxc-parser";
import { applyEdits } from "../mocks-edit/plan/apply-edits";
import { isPureInsertion } from "../mocks-edit/plan/is-pure-insertion";
import { planListInsertion } from "../mocks-edit/plan/list-insertion";
import { propertyKeyName } from "../mocks-edit/plan/property-key-name";
import type { ConfigDeclarationPlan } from "./config-declaration-types";
import { ConfigEditRefusal } from "./config-edit-refusal";
import { exportedObject } from "./exported-object";
import { importLine, listOf, listTargetOf, mergeInsertions } from "./list-site";
import { sourceEntry } from "./render-config-entries";

/** What declaring an import adds to the module the config takes its `sources` from. */
export interface SourcesDeclarationInput {
  /** The module, relative to the project root, as the messages name it. */
  fileName: string;
  /** Its text as read. */
  text: string;
  /** The name it exports the list under, `default` for its default export. */
  exportName: string;
  /** The import's name: its key in the list. */
  name: string;
  /** The generated source's export, and where the module imports it from. */
  source: { binding: string; specifier: string };
}

/**
 * Plan the change that lists an import in the module the config takes its
 * `sources` from — `export const sources = { api }` in `lib/sources.ts`:
 * the import of the generated source after the module's last import, and
 * its entry appended to the list, each written as the module around it is.
 * The module only ever gains text, and the result is read back before it is
 * returned. No filesystem is involved.
 *
 * @param input - The module as read, and what to list
 * @returns The module as changed, and the insertions that change it
 * @throws {ConfigEditRefusal} When Studio should leave the change to the developer
 * @example
 * ```ts
 * const plan = planSourcesDeclaration({
 *   fileName: "lib/sources.ts",
 *   text: 'import { api } from "./api";\nexport const sources = { api };\n',
 *   exportName: "sources",
 *   name: "pets",
 *   source: { binding: "pets", specifier: "../src/api/pets/source" },
 * });
 * plan.text; // → 'import { api } from "./api";\nimport { pets } from "../src/api/pets/source";\nexport const sources = { api, pets };\n'
 * ```
 */
export function planSourcesDeclaration(input: SourcesDeclarationInput): ConfigDeclarationPlan {
  const { fileName, name, source } = input;
  const { parsed, list } = parsedList(fileName, input.text, input.exportName);
  if (keysOf(list).has(name)) {
    throw new ConfigEditRefusal("NAME_IN_USE", `${fileName} lists ${name} already.`);
  }
  const target = listTargetOf(parsed, list);
  const render = () => [sourceEntry(name, source.binding, target.style)];
  const edits = mergeInsertions([
    importLine(target, fileName, source),
    ...planListInsertion(listOf(list), target.site, render),
  ]);
  const text = applyEdits(input.text, edits);
  if (!isPureInsertion(input.text, text, edits)) {
    throw new ConfigEditRefusal(
      "PLAN_REJECTED",
      `Studio planned a change to ${fileName} that was not only added lines, so it changed nothing.`,
    );
  }
  verifyListed(text, input);
  return { text, edits };
}

/**
 * Read a module as code and find the list it exports under a name.
 *
 * @param fileName - The module, as the messages name it
 * @param text - Its text
 * @param exportName - The name it exports the list under
 * @returns The parsed module, and the list
 * @throws {ConfigEditRefusal} `CONFIG_UNREADABLE` when it does not parse, `LIST_SHAPE` when it exports no object Studio can change
 * @example
 * ```ts
 * const { parsed, list } = parsedList("lib/sources.ts", text, "sources");
 * ```
 */
export function parsedList(
  fileName: string,
  text: string,
  exportName: string,
): { parsed: ParsedSource; list: ObjectExpression } {
  const parsed = parseSource(fileName, text);
  if (parsed.problem !== null) {
    const why = `${fileName} does not parse (${parsed.problem.message})`;
    throw new ConfigEditRefusal("CONFIG_UNREADABLE", `${why}, so Studio cannot change it.`);
  }
  const found = exportedObject(parsed.program, exportName);
  if (found.kind === "other")
    throw new ConfigEditRefusal("LIST_SHAPE", `${fileName} ${found.what}.`);
  return { parsed, list: found.object };
}

/**
 * The keys an object literal writes out.
 *
 * @param list - The object
 * @returns Its plain keys
 * @example
 * ```ts
 * keysOf(sources).has("pets"); // → true once listed
 * ```
 */
export function keysOf(list: ObjectExpression): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const property of list.properties) {
    if (property.type !== "Property" || property.computed) continue;
    const key = propertyKeyName(property.key);
    if (key !== null) keys.add(key);
  }
  return keys;
}

/* The planned module still parses, lists the import and imports the generated source. */
function verifyListed(text: string, input: SourcesDeclarationInput): void {
  const { fileName, name, source } = input;
  const reject = (why: string): never => {
    throw new ConfigEditRefusal(
      "PLAN_REJECTED",
      `Studio planned a change to ${fileName} that did not read back as listing ${name} (${why}), so it changed nothing.`,
    );
  };
  const parsed = parseSource(fileName, text);
  if (parsed.problem !== null) reject("it does not parse");
  const found = exportedObject(parsed.program, input.exportName);
  if (found.kind !== "object" || !keysOf(found.object).has(name))
    reject(`the list does not name ${name}`);
  if (!importsBinding(parsed.program, source.binding, source.specifier)) {
    reject(`it does not import ${source.binding} from "${source.specifier}"`);
  }
}

function importsBinding(program: Program, binding: string, specifier: string): boolean {
  return program.body.some(
    (statement: Directive | Statement) =>
      statement.type === "ImportDeclaration" &&
      statement.source.value === specifier &&
      statement.specifiers.some((s) => s.local.name === binding),
  );
}
