import type { Expression, ObjectExpression, ObjectPropertyKind } from "oxc-parser";
import type { AuditScope } from "./audit-scope";
import type { SplitStatements } from "./audit-statements";
import { isMockCallee } from "./mock-imports";
import type { ParsedSource } from "./parse-source";
import { propertyKeyName } from "./property-key-name";
import { textOf } from "./text-of";
import type { PlannedEntry } from "./types";

/**
 * Hold the edited mocks object to the plan: it declares exactly the keys it
 * declared, then the planned ones; its old properties read as they did; and
 * each new one is a call of `defineMockServer`, imported from the mock
 * package, with one object whose fields are exactly the planned ones.
 *
 * @param scope - Both texts of the edit
 * @param split - The edited file's statements, told apart
 * @returns What is wrong, or `null`
 *
 * @example
 * ```ts
 * auditMocksObject(scope, split); // → "the mocks object declares users, apx, not users, api"
 * ```
 */
export function auditMocksObject(scope: AuditScope, split: SplitStatements): string | null {
  const { before, after } = scope;
  if (after.kind !== "object") return "the edited file exports no mocks object";
  return (
    auditHolder(scope, split, after.statement) ??
    auditKeys(scope, after.keys) ??
    (before.kind === "object" ? changedProperty(scope, before.object, after.object) : null) ??
    auditEntries(scope, after.object)
  );
}

/* In a file that had no default export, the one holding the object is the one the plan adds. */
function auditHolder(scope: AuditScope, split: SplitStatements, statement: number): string | null {
  if (scope.before.kind !== "absent") return null;
  const holder = scope.next.program.body[statement];
  if (holder !== undefined && split.added.includes(holder)) return null;
  return "the edited file's default export is not the one the plan adds";
}

function auditKeys(scope: AuditScope, keys: readonly string[]): string | null {
  const { before, plan } = scope;
  if (before.kind === "object" && !sameList(before.keys, plan.literalKeys)) {
    return `the plan read the keys ${plan.literalKeys.join(", ")}, but the file declared ${before.keys.join(", ")}`;
  }
  const expected = [...plan.literalKeys, ...plan.entries.map((entry) => entry.key)];
  if (sameList(keys, expected)) return null;
  return `the mocks object declares ${keys.join(", ")}, not ${expected.join(", ")}`;
}

function auditEntries(scope: AuditScope, object: ObjectExpression): string | null {
  const { plan } = scope;
  for (const [index, entry] of plan.entries.entries()) {
    const property = object.properties[plan.literalKeys.length + index];
    const problem =
      property === undefined
        ? `the entry ${entry.key} is missing`
        : auditEntry(scope, property, entry);
    if (problem !== null) return problem;
  }
  return null;
}

function changedProperty(
  scope: AuditScope,
  before: ObjectExpression,
  after: ObjectExpression,
): string | null {
  for (const [index, property] of before.properties.entries()) {
    const counterpart = after.properties[index];
    if (
      counterpart === undefined ||
      textOf(scope.old, property) !== textOf(scope.next, counterpart)
    ) {
      return `the existing entry at position ${index + 1} changed`;
    }
  }
  return null;
}

function auditEntry(
  scope: AuditScope,
  property: ObjectPropertyKind,
  entry: PlannedEntry,
): string | null {
  const { next, plan, nextImports } = scope;
  const call = plainValue(property);
  if (call?.type !== "CallExpression" || call.arguments.length !== 1) {
    return `the entry ${entry.key} is not a call with one argument`;
  }
  const callee = textOf(next, call.callee);
  if (callee !== plan.serverCallee || !isMockCallee(call.callee, "defineMockServer", nextImports)) {
    return `the entry ${entry.key} calls ${callee}, not defineMockServer from the mock package`;
  }
  const [argument] = call.arguments;
  if (argument?.type !== "ObjectExpression")
    return `the entry ${entry.key} does not pass an object literal`;
  return auditFields(next, argument, entry);
}

function auditFields(
  parsed: ParsedSource,
  argument: ObjectExpression,
  entry: PlannedEntry,
): string | null {
  const fields = argument.properties.map((field) => fieldText(parsed, field));
  const expected = entry.fields.map((field) => `${field.name}: ${field.value}`);
  if (sameList(fields, expected)) return null;
  return `the entry ${entry.key} has the fields ${fields.join(", ")}, not ${expected.join(", ")}`;
}

function plainValue(property: ObjectPropertyKind): Expression | null {
  if (property.type !== "Property" || property.kind !== "init") return null;
  if (property.computed || property.method || property.shorthand) return null;
  return property.value;
}

function fieldText(parsed: ParsedSource, field: ObjectPropertyKind): string {
  const value = plainValue(field);
  if (value === null || field.type !== "Property") return textOf(parsed, field);
  return `${propertyKeyName(field.key) ?? textOf(parsed, field.key)}: ${textOf(parsed, value)}`;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}
