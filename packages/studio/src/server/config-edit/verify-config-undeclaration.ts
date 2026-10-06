import { parseSource } from "../mocks-edit/plan/parse-source";
import { ConfigEditRefusal } from "./config-edit-refusal";
import type { ConfigUndeclarationInput } from "./config-undeclaration-types";
import { findConfigList } from "./find-config-list";
import { locateConfigObject } from "./locate-config-object";

/**
 * Read a planned config back as a config that no longer declares the
 * import: it parses, its default export is still an object Studio finds,
 * and neither list the plan took the import out of names it.
 *
 * @param text - The config as planned
 * @param input - What the plan was to take out
 * @throws {ConfigEditRefusal} `PLAN_REJECTED` when any of it does not hold
 * @example
 * ```ts
 * verifyConfigUndeclaration(plan.text, input); // throws when the plan still declares the import
 * ```
 */
export function verifyConfigUndeclaration(text: string, input: ConfigUndeclarationInput): void {
  const { configName, name } = input;
  const parsed = parseSource(configName, text);
  if (parsed.problem !== null) reject(input, "it does not parse");
  const located = locateConfigObject(parsed.program);
  if (located.kind !== "object") reject(input, "its default export is not an object");
  const keys = (["sources", "imports"] as const).filter((key) =>
    key === "sources" ? input.source : input.importEntry,
  );
  for (const key of keys) {
    const list = findConfigList(located.object, key, parsed.program);
    if (list.kind === "other") reject(input, `it ${list.what}`);
    if (list.kind === "object" && list.keys.has(name)) {
      reject(input, `\`${key}\` still names ${name}`);
    }
  }
}

function reject({ configName, name }: ConfigUndeclarationInput, why: string): never {
  throw new ConfigEditRefusal(
    "PLAN_REJECTED",
    `Studio planned a change to ${configName} that did not read back as taking ${name} out (${why}), so it changed nothing.`,
  );
}
