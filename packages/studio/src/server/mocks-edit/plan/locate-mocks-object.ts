import type { CallExpression, Expression, ObjectExpression } from "oxc-parser";
import { MOCK_PACKAGE } from "../mock-package";
import { MocksEditRefusal } from "../mocks-edit-refusal";
import type { DefaultExport } from "./default-export";
import { findDefaultExport } from "./default-export";
import { readLiteralKeys } from "./literal-keys";
import type { MockImports } from "./mock-imports";
import { isMockCallee } from "./mock-imports";
import type { ParsedSource } from "./parse-source";
import { previewText } from "./preview-text";
import { textOf } from "./text-of";
import { unwrapExpression } from "./unwrap-expression";

/** Where a mocks file's object literal is, if it has a default export at all. */
export type LocatedMocks =
  | {
      kind: "object";
      object: ObjectExpression;
      /** The index of the top-level statement that holds it. */
      statement: number;
      keys: string[];
    }
  | { kind: "absent" };

interface Target {
  expression: Expression;
  statement: number;
}

/**
 * Find the object literal a mocks file exports: `export default` of it, of
 * `defineMocks(it)` with `defineMocks` imported as a value from the mock
 * package, or of a top-level `const` holding either — each maybe wrapped in
 * parentheses, `as`, `satisfies`, `!` or `<T>`.
 *
 * @param parsed - The parsed mocks file, known not to be CommonJS
 * @param imports - What it imports from the mock package
 * @returns The object and its keys, or `absent` when the file has no default export
 * @throws {MocksEditRefusal} `MOCKS_NOT_LITERAL` when the default export is anything
 *   else, there is more than one, or the only one is a type, beside which
 *   TypeScript allows no other; `MOCKS_KEYS_HIDDEN` when the object's keys
 *   cannot all be seen
 *
 * @example
 * ```ts
 * // export default defineMocks({ users: 1 });
 * locateMocksObject(parsed, imports); // → { kind: "object", object, statement: 1, keys: ["users"] }
 * ```
 */
export function locateMocksObject(parsed: ParsedSource, imports: MockImports): LocatedMocks {
  const found = findDefaultExport(parsed.program);
  if (found === null) return { kind: "absent" };
  const target = resolveTarget(found, parsed);
  const object = objectOf(target.expression, parsed, imports);
  return {
    kind: "object",
    object,
    statement: target.statement,
    keys: readLiteralKeys(object, parsed),
  };
}

function resolveTarget(found: DefaultExport, parsed: ParsedSource): Target {
  if (found.kind === "several") {
    throw notLiteral(
      `${parsed.fileName} declares more than one default export, so Studio cannot tell which one holds the mocks.`,
    );
  }
  if (found.kind === "other")
    throw notLiteral(`${parsed.fileName} exports ${found.what} as its default.`);
  if (found.kind === "type") {
    throw notLiteral(
      `${parsed.fileName} already declares a type as its default export, and TypeScript allows one default export per module, so Studio cannot add defineMocks as the default.`,
    );
  }
  if (found.kind === "binding") return resolveConst(found.name, parsed);
  const expression = unwrapExpression(found.expression);
  if (expression.type === "Identifier") return resolveConst(expression.name, parsed);
  return { expression, statement: found.statement };
}

function resolveConst(name: string, parsed: ParsedSource): Target {
  for (const [index, statement] of parsed.program.body.entries()) {
    const declaration =
      statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const declarator of declaration.declarations) {
      if (declarator.id.type !== "Identifier" || declarator.id.name !== name) continue;
      if (declaration.kind !== "const" || declarator.init === null) {
        throw notLiteral(
          `${parsed.fileName} exports ${name}, which is declared with ${declaration.kind}${declarator.init === null ? " and no value" : ""}; Studio adds mocks only to an object held by a const.`,
        );
      }
      return { expression: unwrapExpression(declarator.init), statement: index };
    }
  }
  throw notLiteral(
    `${parsed.fileName} exports ${name}, which is not a const declared in the file.`,
  );
}

function objectOf(
  expression: Expression,
  parsed: ParsedSource,
  imports: MockImports,
): ObjectExpression {
  if (expression.type === "ObjectExpression") return expression;
  if (expression.type !== "CallExpression") {
    throw notLiteral(`${parsed.fileName} does not export an object literal Studio can add to.`);
  }
  if (!isMockCallee(expression.callee, "defineMocks", imports)) {
    const callee = previewText(textOf(parsed, expression.callee));
    throw notLiteral(
      `${parsed.fileName} exports the result of ${callee}(…), not of defineMocks from ${MOCK_PACKAGE}.`,
    );
  }
  return argumentObject(expression, parsed);
}

function argumentObject(call: CallExpression, parsed: ParsedSource): ObjectExpression {
  const [argument, ...rest] = call.arguments;
  const object =
    argument === undefined || argument.type === "SpreadElement" ? null : unwrapExpression(argument);
  if (object?.type === "ObjectExpression" && rest.length === 0) return object;
  throw notLiteral(
    `${parsed.fileName} calls defineMocks with something other than one object literal.`,
  );
}

function notLiteral(message: string): MocksEditRefusal {
  return new MocksEditRefusal("MOCKS_NOT_LITERAL", message);
}
