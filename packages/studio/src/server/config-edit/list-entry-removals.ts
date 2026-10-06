import type { ObjectExpression } from "oxc-parser";
import { planEntryRemoval } from "../../apis/manage/entry-removal";
import { applyEdits } from "../mocks-edit/plan/apply-edits";
import type { ParsedSource } from "../mocks-edit/plan/parse-source";
import { propertyKeyName } from "../mocks-edit/plan/property-key-name";
import { unwrapExpression } from "../mocks-edit/plan/unwrap-expression";
import type { TextEdit } from "../mocks-edit/types";
import { ConfigEditRefusal } from "./config-edit-refusal";
import { findConfigList } from "./find-config-list";

/** One list of the config an import is taken out of. */
export interface ListRemoval {
  /** The config, parsed. */
  parsed: ParsedSource;
  /** The object the config exports. */
  config: ObjectExpression;
  /** The list. */
  key: "sources" | "imports";
  /** The config's file name, for the messages. */
  configName: string;
  /** The import's name. */
  name: string;
}

/**
 * Plan taking an import's entries out of one list of the config, each with
 * its doc comment and its comma. A list left with nothing in it reads `{}`;
 * an `imports` key written in the config object itself goes whole, since a
 * config needs none. The names the entries' values are go into `locals`,
 * for their imports to go too once nothing else uses them.
 *
 * @param removal - The config, the list and the import
 * @param locals - Collects the names the removed entries' values are
 * @returns The removals, in text order; none when the list does not name the import
 * @throws {ConfigEditRefusal} `LIST_SHAPE` when the list is not an object Studio can change
 * @example
 * ```ts
 * const edits = listEntryRemovals({ parsed, config, key: "sources", configName, name: "pets" }, locals);
 * ```
 */
export function listEntryRemovals(removal: ListRemoval, locals: Set<string>): TextEdit[] {
  const { parsed, config, key, configName, name } = removal;
  const list = findConfigList(config, key, parsed.program);
  if (list.kind === "other")
    throw new ConfigEditRefusal("LIST_SHAPE", `${configName} ${list.what}.`);
  if (list.kind === "absent" || !list.keys.has(name)) return [];
  const items = list.object.properties;
  const going = new Set<number>();
  items.forEach((property, at) => {
    if (property.type !== "Property" || property.computed) return;
    if (propertyKeyName(property.key) !== name) return;
    going.add(at);
    const value = unwrapExpression(property.value);
    if (value.type === "Identifier") locals.add(value.name);
  });
  const edits = planEntryRemoval(parsed, items, list.object.start, going);
  if (going.size < items.length) return edits;
  const own = key === "imports" ? config.properties.findIndex((p) => holds(p, list.object)) : -1;
  if (own !== -1) return planEntryRemoval(parsed, config.properties, config.start, new Set([own]));
  return emptied(parsed.text, list.object, edits);
}

/* Whether a property of the config object writes the list as its value. */
function holds(property: ObjectExpression["properties"][number], list: ObjectExpression): boolean {
  return property.type === "Property" && unwrapExpression(property.value) === list;
}

/* A list with only space left between its braces closes up to `{}`. */
function emptied(text: string, list: ObjectExpression, edits: readonly TextEdit[]): TextEdit[] {
  const removed = edits.reduce((sum, edit) => sum + edit.end - edit.start, 0);
  const close = list.end - 1;
  const left = applyEdits(text, edits).slice(list.start + 1, close - removed);
  if (left.trim() !== "") return [...edits];
  return [{ start: list.start + 1, end: close, text: "" }];
}
