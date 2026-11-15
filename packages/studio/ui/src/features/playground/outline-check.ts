import type { OutlineField, OutlineValue, SchemaOutline } from "@noverax/courier-studio-core";

import { outlineLabel } from "./outline-label";
import { isObjectValue, type ValueType, valueTypeOf } from "./value-type";

/** The first part of variables their schema does not take, and where it sits: `items[2].sku`. */
export type OutlineProblem =
  /** A field the object is refused without is not there. */
  | { kind: "missing"; path: string }
  /** A value is not of the type, or not one of the values, the schema takes there. */
  | { kind: "type"; path: string; expected: string; got: string }
  /** An object is none of the forms a union takes, and no field of it says which it is meant as. */
  | { kind: "forms"; path: string; count: number };

/* The most characters of a value a problem quotes; a longer one is named by its type. */
const MAX_QUOTED = 24;

function at(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

function takesType(outline: SchemaOutline, type: ValueType): boolean {
  if (outline.type === "enum") return outline.values.some((value) => valueTypeOf(value) === type);
  if (outline.type === "union") return outline.options.some((option) => takesType(option, type));
  return outline.type === type;
}

/* A part that lists values of a type is told one of them is not among them: the value is quoted. */
function listsValuesOf(outline: SchemaOutline, type: ValueType): boolean {
  if (outline.type === "enum") return outline.values.some((value) => valueTypeOf(value) === type);
  return outline.type === "union" && outline.options.some((option) => listsValuesOf(option, type));
}

function mismatch(value: unknown, outline: SchemaOutline, path: string): OutlineProblem {
  const type = valueTypeOf(value);
  const quoted = listsValuesOf(outline, type) ? JSON.stringify(value) : undefined;
  const got = quoted !== undefined && quoted.length <= MAX_QUOTED ? quoted : type;
  return { kind: "type", path, expected: outlineLabel(outline), got };
}

function fieldsProblem(
  value: Record<string, unknown>,
  fields: readonly OutlineField[],
  path: string,
): OutlineProblem | undefined {
  for (const field of fields) {
    const where = at(path, field.name);
    if (!Object.hasOwn(value, field.name)) {
      if (field.required) return { kind: "missing", path: where };
      continue;
    }
    const problem = field.outline && outlineProblemOf(value[field.name], field.outline, where);
    if (problem) return problem;
  }
  return undefined;
}

function itemsProblem(
  items: readonly unknown[],
  outline: SchemaOutline,
  path: string,
): OutlineProblem | undefined {
  for (const [index, item] of items.entries()) {
    const problem = outlineProblemOf(item, outline, `${path}[${index}]`);
    if (problem) return problem;
  }
  return undefined;
}

/* The values an object form fixes a field to — a tag such as `kind` — and whether it requires it. */
function tagIn(
  form: SchemaOutline,
  name: string,
): { values: readonly OutlineValue[]; required: boolean } | undefined {
  const field = form.type === "object" ? form.fields?.find((one) => one.name === name) : undefined;
  if (field?.outline?.type !== "enum") return undefined;
  return { values: field.outline.values, required: field.required };
}

/* A field tells object forms apart when each form fixes it to values no other form takes:
   a `kind` of "card" or "bank" does, a `version` every form fixes to "v1" does not. */
function isTag(forms: readonly SchemaOutline[], name: string): boolean {
  const taken = new Set<OutlineValue>();
  for (const form of forms) {
    const values = tagIn(form, name)?.values;
    if (!values) return false;
    const own = [...new Set(values)];
    if (own.some((value) => taken.has(value))) return false;
    for (const value of own) taken.add(value);
  }
  return true;
}

/* Of object forms that all refuse a value, the one its tag names — `"kind": "card"` — is the one
   it is meant as, and its problem is the value's; a tag that names none is the problem itself. */
function taggedProblem(
  value: Record<string, unknown>,
  forms: readonly SchemaOutline[],
  path: string,
): OutlineProblem | undefined {
  const [first] = forms;
  const fields = first?.type === "object" ? (first.fields ?? []) : [];
  const tag = fields.find((field) => isTag(forms, field.name))?.name;
  if (tag === undefined) return undefined;
  const given = Object.hasOwn(value, tag) ? value[tag] : undefined;
  const form = forms.find((one) => tagIn(one, tag)?.values.some((each) => each === given));
  if (form) return outlineProblemOf(value, form, path);
  if (given !== undefined) {
    const values = forms.flatMap((one) => tagIn(one, tag)?.values ?? []);
    return mismatch(given, { type: "enum", values }, at(path, tag));
  }
  const required = forms.every((one) => tagIn(one, tag)?.required);
  return required ? { kind: "missing", path: at(path, tag) } : undefined;
}

/* A value fits a union when it fits one of its forms. When it fits none, the form it is meant as
   is the one of its type, or the one its tag names, and that form's problem is the value's. */
function unionProblem(
  value: unknown,
  options: readonly SchemaOutline[],
  path: string,
): OutlineProblem | undefined {
  const forms = options.filter((option) => takesType(option, valueTypeOf(value)));
  if (forms.length === 0) return mismatch(value, { type: "union", options }, path);
  const problems = forms.map((form) => outlineProblemOf(value, form, path));
  if (problems.includes(undefined)) return undefined;
  const [only] = problems;
  if (only && problems.length === 1) return only;
  const tagged = isObjectValue(value) ? taggedProblem(value, forms, path) : undefined;
  return tagged ?? { kind: "forms", path, count: forms.length };
}

/**
 * The first part of variables that does not fit what their schema takes,
 * by the schema's outline: a value of another type, one an enum does not
 * list, or a field an object is refused without. What the outline leaves
 * out — bounds, formats, refinements — is the schema's to check.
 *
 * @param value - The variables, as the schema sees them: defaults filled in
 * @param outline - What the schema takes
 * @param path - Where the value sits, for a part of the variables
 * @returns The problem, or `undefined` when the variables fit
 * @example
 * ```ts
 * outlineProblemOf({ orderId: 1 }, { type: "object", fields: [{ name: "orderId", required: true, outline: { type: "string" } }] });
 * // { kind: "type", path: "orderId", expected: "string", got: "number" }
 * ```
 */
export function outlineProblemOf(
  value: unknown,
  outline: SchemaOutline,
  path = "",
): OutlineProblem | undefined {
  switch (outline.type) {
    case "union":
      return unionProblem(value, outline.options, path);
    case "enum":
      return outline.values.some((one) => one === value)
        ? undefined
        : mismatch(value, outline, path);
    case "array":
      if (!Array.isArray(value)) return mismatch(value, outline, path);
      return outline.items && itemsProblem(value, outline.items, path);
    case "object":
      if (!isObjectValue(value)) return mismatch(value, outline, path);
      return fieldsProblem(value, outline.fields ?? [], path);
    default:
      return valueTypeOf(value) === outline.type ? undefined : mismatch(value, outline, path);
  }
}
