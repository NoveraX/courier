import { relative } from "node:path";
import type { ObjectExpression, ObjectProperty } from "oxc-parser";

import type { TextEdit } from "../../mocks-edit/types";
import type { Drift } from "../endpoint-drift";
import { pathSteps, splitFieldPath } from "../field-path";
import { zodOfTypes } from "../zod-of-types";
import type { Placed } from "./bound-value";
import { changedValue } from "./changed-value";
import { fieldInsertions } from "./field-insertions";
import type { SourceModules } from "./source-modules";
import { fieldOf, type WrittenObject, written } from "./written-schema";

/** The edits that fix a schema, and the differences they leave as they are. */
export interface SchemaEdits {
  /** Each file to change, with the edits to its text, in text order */
  readonly files: ReadonlyMap<string, readonly TextEdit[]>;
  /** The paths of the differences the edits fix */
  readonly fixed: readonly string[];
  /** The differences no edit fixes, each with why */
  readonly left: ReadonlyArray<{ readonly path: string; readonly why: string }>;
}

/** A field to declare in an object, as Zod writes it. */
interface NewField {
  readonly key: string;
  readonly schema: string;
}

/** A field whose schema changes: to take more types, to be optional, or both. */
interface ChangedField {
  readonly path: string;
  readonly property: ObjectProperty;
  type?: Drift | undefined;
  optional: boolean;
}

/**
 * Plan the edits that make a Zod response schema take its endpoint's real
 * answers: a field it does not declare is added to its object — optional
 * when not every answer held it — a field that came as another type takes
 * that type too, or instead when no answer came as the declared one, and a
 * required field some answers lacked becomes optional. A field's
 * constraints and modifiers are kept as written. A difference Studio
 * cannot place — in a schema it does not read, or a file the config does
 * not load — is left, with why.
 *
 * @param modules - The project's modules
 * @param response - The endpoint's response schema, as `.response(…)` takes it
 * @param drift - How the answers differ from it
 * @param calls - How many answers were seen
 * @param editable - Whether Studio may change a file: one the config loads
 * @returns The edits by file, what they fix, and what they leave
 * @example
 * ```ts
 * planSchemaEdits(modules, response, report.drift, report.calls, (path) => deps.has(path));
 * ```
 */
export function planSchemaEdits(
  modules: SourceModules,
  response: Placed,
  drift: readonly Drift[],
  calls: number,
  editable: (path: string) => boolean,
): SchemaEdits {
  const added = new Map<ObjectExpression, { path: string; fields: NewField[] }>();
  const changed = new Map<ObjectProperty, ChangedField>();
  const fixed: string[] = [];
  const left: Array<{ path: string; why: string }> = [];
  for (const difference of drift) {
    const why = planned(modules, response, difference, calls, editable, added, changed);
    if (why === undefined) fixed.push(difference.path);
    else left.push({ path: difference.path, why });
  }
  return { files: editsByFile(modules, added, changed), fixed, left };
}

function planned(
  modules: SourceModules,
  response: Placed,
  difference: Drift,
  calls: number,
  editable: (path: string) => boolean,
  added: Map<ObjectExpression, { path: string; fields: NewField[] }>,
  changed: Map<ObjectProperty, ChangedField>,
): string | undefined {
  const { within, key } = splitFieldPath(difference.path);
  if (key === undefined)
    return "Studio changes a field's schema, and this is the answer's as a whole";
  const object = objectAt(modules, response, within);
  if ("why" in object) return object.why;
  const field = fieldOf(object, key);
  if (field !== undefined && "why" in field) return field.why;
  if (difference.kind === "undeclared") {
    if (field !== undefined) return `${key} is declared already where Studio looked`;
    if (!editable(object.path)) return notLoaded(modules, object.path);
    const optional = difference.count < calls ? ".optional()" : "";
    const entry = added.get(object.literal) ?? { path: object.path, fields: [] };
    entry.fields.push({ key, schema: `${zodOfTypes(difference.observed)}${optional}` });
    added.set(object.literal, entry);
    return undefined;
  }
  if (field === undefined) return `Studio did not find where ${key} is declared`;
  if (!editable(field.path)) return notLoaded(modules, field.path);
  const change = changed.get(field.property) ?? {
    path: field.path,
    property: field.property,
    optional: false,
  };
  if (difference.kind === "type") change.type = difference;
  else change.optional = true;
  changed.set(field.property, change);
  return undefined;
}

/* The object schema a path leads to from the response schema, through fields and list items. */
function objectAt(
  modules: SourceModules,
  response: Placed,
  within: string,
): WrittenObject | { why: string } {
  let current = written(modules, response);
  for (const step of pathSteps(within)) {
    if (current.kind === "unread") return { why: current.why };
    if (step === "[]") {
      if (current.kind !== "array")
        return { why: `${within || "the answer"} is not written as a list` };
      current = written(modules, current.element);
      continue;
    }
    if (current.kind !== "object")
      return { why: `${step} is not inside an object schema Studio reads` };
    const field = fieldOf(current.object, step);
    if (field === undefined) return { why: `Studio did not find where ${step} is declared` };
    if ("why" in field) return field;
    current = written(modules, { path: field.path, node: field.property.value });
  }
  if (current.kind === "unread") return { why: current.why };
  return current.kind === "object"
    ? current.object
    : { why: `${within || "the answer"} is not written as an object` };
}

function editsByFile(
  modules: SourceModules,
  added: Map<ObjectExpression, { path: string; fields: NewField[] }>,
  changed: Map<ObjectProperty, ChangedField>,
): Map<string, TextEdit[]> {
  const files = new Map<string, TextEdit[]>();
  const add = (path: string, edits: readonly TextEdit[]): void => {
    files.set(path, [...(files.get(path) ?? []), ...edits]);
  };
  for (const [literal, { path, fields }] of added) {
    const source = modules.module(path);
    if (source !== undefined) add(path, fieldInsertions(source, literal, fields));
  }
  for (const change of changed.values()) {
    const source = modules.module(change.path);
    const value =
      source && changedValue(source.text, change.property.value, change.type, change.optional);
    if (value !== undefined) add(change.path, [value]);
  }
  for (const [path, edits] of files)
    files.set(
      path,
      [...edits].sort((a, b) => a.start - b.start),
    );
  return files;
}

function notLoaded(modules: SourceModules, path: string): string {
  return `${relative(modules.root, path)} is not among the files the config loads, so Studio does not change it`;
}
