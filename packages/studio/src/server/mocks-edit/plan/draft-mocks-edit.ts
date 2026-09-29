import type { TextEdit } from "../types";
import { applyEdits } from "./apply-edits";
import { configImportForm } from "./config-import-form";
import type { ConfigSpecifiers } from "./config-specifiers";
import { configSpecifiers } from "./config-specifiers";
import { DEFAULT_STYLE, detectStyle } from "./detect-style";
import type { EntryEdits } from "./entry-edits";
import { planEntryEdits } from "./entry-edits";
import { importsCarryExtensions } from "./imports-carry-extensions";
import { insertion } from "./insertion";
import { parseSource } from "./parse-source";
import type { ImportPlan } from "./plan-imports";
import { planImports } from "./plan-imports";
import type { EditableFile } from "./read-editable";
import { entryFields } from "./render-entry";
import type { EntryContext, FileStyle, MocksDraft, PlanInput, PlannedInsertion } from "./types";

/** The insertions a draft plans, and how it writes them. */
interface Insertions {
  specifiers: ConfigSpecifiers;
  imports: ImportPlan;
  entries: EntryEdits;
  ctx: EntryContext;
}

/**
 * Plan the insertions that add mocks to a mocks file, and what the plan
 * claims, before either is checked: entries appended to the object the file
 * exports, or — in a file without a default export — a new
 * `export default defineMocks({ ... })` at its end; plus the imports they
 * need. A file Studio creates is drafted as an empty one, so the same
 * insertions write it whole.
 *
 * @param file - The mocks file, as read for the edit; "" for one Studio creates
 * @param input - The mocks to declare and the config they come from
 * @param guardMocksColon - Whether the text must never read `mocks:`, as a snippet must not
 * @returns The planned text, its insertions and its claims
 * @throws {MocksEditRefusal} `IMPORT_NAME_TAKEN` when a name the edit must import is taken
 *
 * @example
 * ```ts
 * draftMocksEdit(readEditable("courier.mocks.ts", ""), input).edits;
 * // → [{ start: 0, end: 0, text: "import { defineMocks, defineMockServer } …" }]
 * ```
 */
export function draftMocksEdit(
  file: EditableFile,
  input: PlanInput,
  guardMocksColon = false,
): MocksDraft {
  const insertions = planInsertions(file, input, guardMocksColon);
  const edits = mergeInsertions([...insertions.imports.edits, ...insertions.entries.edits]);
  return {
    text: applyEdits(file.parsed.text, edits),
    edits,
    literalKeys: file.literalKeys,
    configSpecifier: insertions.imports.configSpecifier,
    audit: claimsOf(file, input, insertions),
  };
}

function planInsertions(
  file: EditableFile,
  input: PlanInput,
  guardMocksColon: boolean,
): Insertions {
  const { parsed, located } = file;
  const style = styleOf(file, input);
  const explicit = input.explicitExtensions || importsCarryExtensions(parsed.program);
  const form = configImportForm(input.configName, input.configText);
  const specifiers = configSpecifiers(input.configName, explicit, form);
  const imports = planImports(parsed, file.imports, specifiers, style, located.kind === "absent");
  const { serverCallee, configLocal } = imports;
  const ctx = { serverCallee, configLocal, style, guardMocksColon };
  const entries = planEntryEdits(parsed, located, imports, input.requests, ctx);
  return { specifiers, imports, entries, ctx };
}

function claimsOf(file: EditableFile, input: PlanInput, insertions: Insertions): PlannedInsertion {
  const { specifiers, imports, entries, ctx } = insertions;
  return {
    fileName: file.parsed.fileName,
    oldText: file.parsed.text,
    literalKeys: file.literalKeys,
    entries: input.requests.map((request) => ({
      key: request.key,
      fields: entryFields(request, ctx),
    })),
    serverCallee: ctx.serverCallee,
    configLocal: ctx.configLocal,
    configSpecifiers: specifiers.accepted,
    configForm: specifiers.form,
    addedStatements: [...imports.addedStatements, ...entries.statements],
    extendedImport: imports.extendedImport,
  };
}

/* A file with no text shows no style of its own, so it is written like the
   config beside it — in Biome's defaults when the config was not read. */
function styleOf({ parsed, located }: EditableFile, input: PlanInput): FileStyle {
  if (parsed.text !== "")
    return detectStyle(parsed, located.kind === "object" ? located.object : null);
  if (input.configText === null) return DEFAULT_STYLE;
  return detectStyle(parseSource(input.configName, input.configText));
}

/* Insertions at one offset fold into one, in the order they were planned,
   so the edits come ascending with no two at the same place. */
function mergeInsertions(edits: readonly TextEdit[]): TextEdit[] {
  const merged: TextEdit[] = [];
  for (const edit of [...edits].sort((a, b) => a.start - b.start)) {
    const previous = merged.at(-1);
    if (previous !== undefined && previous.start === edit.start) {
      merged[merged.length - 1] = insertion(edit.start, previous.text + edit.text);
    } else {
      merged.push(edit);
    }
  }
  return merged;
}
