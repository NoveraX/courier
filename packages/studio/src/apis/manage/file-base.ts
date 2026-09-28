import type { BindingPattern, Expression, ObjectPattern, Program, Statement } from "oxc-parser";
import { propertyKeyName } from "../../server/mocks-edit/plan/property-key-name";
import { unwrapExpression } from "../../server/mocks-edit/plan/unwrap-expression";

/* The names `courier` is imported under, whatever module it comes from. */
function courierLocals(program: Program): Set<string> {
  const locals = new Set(["courier"]);
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type !== "ImportSpecifier") continue;
      const imported =
        specifier.imported.type === "Identifier"
          ? specifier.imported.name
          : specifier.imported.value;
      if (imported === "courier") locals.add(specifier.local.name);
    }
  }
  return locals;
}

function callsCourier(init: Expression | null, locals: ReadonlySet<string>): boolean {
  if (init === null) return false;
  const call = unwrapExpression(init);
  return (
    call.type === "CallExpression" &&
    call.callee.type === "Identifier" &&
    locals.has(call.callee.name)
  );
}

function variablesOf(statement: Statement): Statement | null {
  const declaration =
    statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
  return declaration?.type === "VariableDeclaration" ? declaration : null;
}

/** A builder `courier()` hands out: `endpoint`, or `stream` for streams of events. */
export type CourierBuilder = "endpoint" | "stream";

/**
 * Read how a file names a builder its definitions start from: the name it
 * destructures the builder into from a `courier()` call, or `x.endpoint` for
 * a `courier()` call kept whole as `x`, configured or not.
 *
 * @param program - The parsed file
 * @param builder - The builder to look for; `endpoint` unless said otherwise
 * @returns The base, or `null` when no top-level `courier()` call names one
 * @example
 * ```ts
 * fileBase(parseSource("a.ts", "const api = courier({ headers });").program); // → "api.endpoint"
 * fileBase(parseSource("a.ts", "const { endpoint } = courier();").program, "stream"); // → null
 * ```
 */
export function fileBase(program: Program, builder: CourierBuilder = "endpoint"): string | null {
  for (const id of courierTargets(program)) {
    if (id.type === "Identifier") return `${id.name}.${builder}`;
    if (id.type !== "ObjectPattern") continue;
    for (const property of id.properties) {
      if (property.type === "RestElement" || propertyKeyName(property.key) !== builder) continue;
      if (property.value.type === "Identifier") return property.value.name;
    }
  }
  return null;
}

/**
 * The `{ … }` a top-level `courier()` call is destructured into, where
 * another builder can be added beside those taken.
 *
 * @param program - The parsed file
 * @returns The pattern, or `null` when no `courier()` call is destructured
 * @example
 * ```ts
 * courierPattern(parseSource("a.ts", "const { endpoint } = courier();").program)?.properties.length; // → 1
 * ```
 */
export function courierPattern(program: Program): ObjectPattern | null {
  for (const id of courierTargets(program)) if (id.type === "ObjectPattern") return id;
  return null;
}

/* What each top-level `courier()` call is assigned to, in order. */
function courierTargets(program: Program): BindingPattern[] {
  const locals = courierLocals(program);
  const targets: BindingPattern[] = [];
  for (const statement of program.body) {
    const declaration = variablesOf(statement);
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const { id, init } of declaration.declarations) {
      if (callsCourier(init, locals)) targets.push(id);
    }
  }
  return targets;
}
