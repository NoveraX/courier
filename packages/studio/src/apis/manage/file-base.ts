import type { Expression, Program, Statement } from "oxc-parser";
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

/**
 * Read how a file names the base its endpoints are built from: the name it
 * destructures `endpoint` into from a `courier()` call, or `x.endpoint` for
 * a `courier()` call kept whole as `x`, configured or not.
 *
 * @param program - The parsed file
 * @returns The base, or `null` when no top-level `courier()` call names one
 * @example
 * ```ts
 * fileBase(parseSource("a.ts", "const api = courier({ headers });").program); // → "api.endpoint"
 * ```
 */
export function fileBase(program: Program): string | null {
  const locals = courierLocals(program);
  for (const statement of program.body) {
    const declaration = variablesOf(statement);
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const { id, init } of declaration.declarations) {
      if (!callsCourier(init, locals)) continue;
      if (id.type === "Identifier") return `${id.name}.endpoint`;
      if (id.type !== "ObjectPattern") continue;
      for (const property of id.properties) {
        if (property.type === "RestElement" || propertyKeyName(property.key) !== "endpoint")
          continue;
        if (property.value.type === "Identifier") return property.value.name;
      }
    }
  }
  return null;
}
