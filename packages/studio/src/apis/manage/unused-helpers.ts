import { type ParsedSource, parseSource } from "@noverax/courier-cli/devkit";
import type { Directive, Statement } from "oxc-parser";
import { applyEdits } from "../../server/mocks-edit/plan/apply-edits";
import { collectModuleBindings } from "../../server/mocks-edit/plan/module-bindings";
import { aboveStatement } from "./above-statement";
import { referencedNames } from "./referenced-names";

/* What the helpers Studio writes into a file of endpoints bind: `_ownFields`, and the type it names. */
const HELPERS: ReadonlySet<string> = new Set(["_ownFields", "_OwnFieldsOf"]);

/** A file with the helpers nothing in it uses taken out. */
export interface HelpersLeft {
  /** The file, as it was when every helper is still used. */
  text: string;
  /** What the helpers taken out bound, for a merge to note. */
  removed: string[];
  /** Every name they referred to, whose imports may have been theirs alone. */
  references: Set<string>;
}

/**
 * Take out of a file of endpoints the helpers Studio writes into it once no
 * other code of the file uses them, as an import goes with the last name of
 * it used: `_ownFields` and its type go with the last endpoint whose
 * variables or answer called it, which an update or Manage took out. Left
 * behind, it was a function nothing reads, which a project compiling with
 * `noUnusedLocals` refuses and Biome warns of. A helper still used stays,
 * and so does every other statement.
 *
 * @param fileName - The file's name, for the parser
 * @param text - The file
 * @returns The file without the unused helpers, what they bound, and what they referred to
 * @example
 * ```ts
 * withoutUnusedHelpers("index.ts", afterRemoval).removed; // ["_OwnFieldsOf", "_ownFields"]
 * ```
 */
export function withoutUnusedHelpers(fileName: string, text: string): HelpersLeft {
  const parsed = parseSource(fileName, text);
  const unchanged = { text, removed: [], references: new Set<string>() };
  if (parsed.problem !== null) return unchanged;
  const { body } = parsed.program;
  const helpers = body.filter((statement) => bindsHelperOnly(parsed, statement));
  if (helpers.length === 0) return unchanged;
  const used = referencedNames(body.filter((statement) => !helpers.includes(statement)));
  if ([...HELPERS].some((name) => used.has(name))) return unchanged;
  const edits = helpers.map((statement) => ({
    start: aboveStatement(parsed, statement.start),
    end: withBlankLineAfter(text, statement.end),
    text: "",
  }));
  const left = applyEdits(text, edits);
  return {
    text: left.endsWith("\n\n") ? `${left.trimEnd()}\n` : left,
    removed: [...new Set(helpers.flatMap((statement) => bound(parsed, statement)))],
    references: referencedNames(helpers),
  };
}

/* A statement of the file's own, not exported, that binds a helper's name and nothing else. */
function bindsHelperOnly(parsed: ParsedSource, statement: Directive | Statement): boolean {
  if (statement.type === "ExportNamedDeclaration") return false;
  const names = bound(parsed, statement);
  return names.length > 0 && names.every((name) => HELPERS.has(name));
}

function bound(parsed: ParsedSource, statement: Directive | Statement): string[] {
  return [...collectModuleBindings({ ...parsed.program, body: [statement] }).keys()];
}

/* The end of the statement's line, and of a blank line after it. */
function withBlankLineAfter(text: string, end: number): number {
  const eol = text.indexOf("\n", end);
  const lineEnd = eol === -1 ? text.length : eol + 1;
  const next = text.indexOf("\n", lineEnd);
  const blank = next !== -1 && text.slice(lineEnd, next).trim() === "";
  return blank ? next + 1 : lineEnd;
}
