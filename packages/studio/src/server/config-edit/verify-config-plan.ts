import { parseSource } from "@noverax/courier-cli/devkit";
import type { Directive, Program, Statement } from "oxc-parser";
import type { ConfigDeclarationInput } from "./config-declaration-types";
import { ConfigEditRefusal } from "./config-edit-refusal";
import { findConfigList } from "./find-config-list";
import { locateConfigObject } from "./locate-config-object";

/**
 * Read a planned config back as a config: it parses, its default export is
 * still an object Studio finds, `sources` names the import and the config
 * imports the generated source under that name, and `imports` names the
 * import — each only where the plan was to add it.
 *
 * @param text - The config as planned
 * @param input - What the plan was to declare
 * @throws {ConfigEditRefusal} `PLAN_REJECTED` when any of it does not hold
 * @example
 * ```ts
 * verifyConfigPlan(plan.text, input); // throws when the plan is not the declaration
 * ```
 */
export function verifyConfigPlan(text: string, input: ConfigDeclarationInput): void {
  const { configName, name, source, importEntry } = input;
  const parsed = parseSource(configName, text);
  if (parsed.problem !== null) reject(configName, "it does not parse");
  const located = locateConfigObject(parsed.program);
  if (located.kind !== "object") reject(configName, "its default export is not an object");
  if (source) {
    const sources = findConfigList(located.object, "sources", parsed.program);
    if (sources.kind !== "object" || !sources.keys.has(name)) {
      reject(configName, `\`sources\` does not name ${name}`);
    }
    if (!importsBinding(parsed.program, source.binding, source.specifier)) {
      reject(configName, `it does not import ${source.binding} from "${source.specifier}"`);
    }
  }
  if (importEntry) {
    const imports = findConfigList(located.object, "imports", parsed.program);
    if (imports.kind !== "object" || !imports.keys.has(name)) {
      reject(configName, `\`imports\` does not name ${name}`);
    }
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

function reject(configName: string, why: string): never {
  throw new ConfigEditRefusal(
    "PLAN_REJECTED",
    `Studio planned a change to ${configName} that did not read back as the declaration (${why}), so it changed nothing.`,
  );
}
