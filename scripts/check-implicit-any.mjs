#!/usr/bin/env node
/// <reference types="node" />
/**
 * Fail when a value typed `any` is used unchecked in the packages' sources.
 *
 * Biome refuses an `any` written in the source, but declarations still hand
 * one over: `JSON.parse`, `Reflect.get`, a promise's rejection reason,
 * `AbortSignal.reason`, a third-party config object, the fields of a generic
 * class narrowed by `instanceof`. The compiler checks nothing done with such a
 * value, so a misspelt field or a wrong shape passes it.
 *
 * This walks every source file with the type checker and reports each name,
 * call and index typed `any` that is declared, read from, called, or handed
 * to a place with a type of its own. A value typed `any` does no harm where
 * it lands in a place that takes anything — one typed `unknown`, or a
 * parameter a library declares `any`, as `JSON.stringify`'s — or where it is
 * only compared, tested or thrown away. The one fix is to read it into
 * `unknown` and check it: `const data: unknown = event.data`.
 *
 * Exits 1 with a list of places when found.
 */

import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import { argv, exit } from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/* The Studio UI sits one directory deeper than the root program reaches, so
   it is checked through its own. */
const PROGRAMS = [
  { tsconfig: "tsconfig.json", sources: /\/packages\/[^/]+\/src\// },
  { tsconfig: "packages/studio/ui/tsconfig.json", sources: /\/packages\/studio\/ui\/src\// },
];

const COMPARISONS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

/**
 * Every value typed `any` used unchecked in the source files of one program.
 *
 * @param {string} tsconfig - Path of the program's tsconfig
 * @param {RegExp} sources - Which of the program's files to check
 * @returns {Array<{ file: string, line: number, column: number, name: string }>}
 * @example
 * findImplicitAny("tsconfig.json", /\/src\//);
 * // → [{ file: "/repo/src/read.ts", line: 3, column: 9, name: "body" }]
 */
export function findImplicitAny(tsconfig, sources) {
  const config = ts.getParsedCommandLineOfConfigFile(
    resolve(tsconfig),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
      },
    },
  );
  const program = ts.createProgram(config.fileNames, config.options);
  const checker = program.getTypeChecker();
  const found = [];
  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile || !sources.test(file.fileName)) continue;
    visit(file, file, checker, found);
  }
  return found;
}

function visit(node, file, checker, found) {
  if (isTypeLevel(node)) return;
  if (isRead(node) && isAny(checker.getTypeAtLocation(node)) && !isHarmless(node, checker)) {
    const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
    const name = ts.isIdentifier(node)
      ? node.text
      : node.getText(file).replace(/\s+/g, " ").slice(0, 60);
    found.push({ file: file.fileName, line: line + 1, column: character + 1, name });
  }
  ts.forEachChild(node, (child) => visit(child, file, checker, found));
}

/* Types, and the names imports and exports move around, carry no value. */
function isTypeLevel(node) {
  return (
    ts.isTypeNode(node) ||
    ts.isImportDeclaration(node) ||
    ts.isExportDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isTypeParameterDeclaration(node)
  );
}

/* A name, or what a call or an index gives back. */
function isRead(node) {
  if (ts.isIdentifier(node)) return isValueName(node);
  return ts.isCallExpression(node) || ts.isElementAccessExpression(node);
}

/* An intrinsic JSX tag, a label, or a key — of a destructuring, an object
   literal or a JSX attribute — names no value of its own. */
function isValueName(node) {
  const parent = node.parent;
  if (!parent) return true;
  if (isJsxTag(parent) && parent.tagName === node) return !/^[a-z]/.test(node.text);
  if (ts.isBindingElement(parent)) return parent.propertyName !== node;
  if (ts.isPropertyAssignment(parent) || ts.isJsxAttribute(parent)) return parent.name !== node;
  return !(ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent));
}

function isJsxTag(node) {
  return (
    ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxClosingElement(node)
  );
}

function isAny(type) {
  return (type.flags & ts.TypeFlags.Any) !== 0;
}

/* What is read — `event.data` for `data`, awaited or not — is only inspected,
   or lands in a place that takes anything. A name being declared is never
   harmless: whatever reads it later reads an `any`. */
function isHarmless(node, checker) {
  if (isDeclaredName(node)) return false;
  let read = node;
  while (read.parent && ts.isPropertyAccessExpression(read.parent) && read.parent.name === read)
    read = read.parent;
  while (read.parent && isPassThrough(read.parent)) read = read.parent;
  if (read.parent && isInspection(read.parent, read)) return true;
  const place = checker.getContextualType(read);
  return place !== undefined && (place.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)) !== 0;
}

function isDeclaredName(node) {
  const parent = node.parent;
  return (
    parent !== undefined &&
    (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent)) &&
    parent.name === node
  );
}

function isPassThrough(node) {
  return (
    ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) || ts.isAwaitExpression(node)
  );
}

/* Thrown away, compared, or tested for its type or its truth. */
function isInspection(parent, read) {
  if (
    ts.isExpressionStatement(parent) ||
    ts.isVoidExpression(parent) ||
    ts.isTypeOfExpression(parent)
  ) {
    return true;
  }
  if (ts.isPrefixUnaryExpression(parent)) return parent.operator === ts.SyntaxKind.ExclamationToken;
  if (!ts.isBinaryExpression(parent)) return false;
  const operator = parent.operatorToken.kind;
  return (
    COMPARISONS.has(operator) ||
    (operator === ts.SyntaxKind.InstanceOfKeyword && parent.left === read)
  );
}

function main() {
  let count = 0;
  for (const { tsconfig, sources } of PROGRAMS) {
    for (const { file, line, column, name } of findImplicitAny(resolve(ROOT, tsconfig), sources)) {
      console.error(`${relative(ROOT, file)}:${line}:${column}  '${name}' is typed any`);
      count++;
    }
  }
  if (count === 0) {
    console.log("check-implicit-any: no value typed any is used unchecked");
    return;
  }
  console.error(
    `\ncheck-implicit-any: ${count} value(s) typed any. Read each into unknown and check it.`,
  );
  exit(1);
}

// Only run as CLI when invoked directly (not when imported by the self-test).
const invokedAsScript = argv[1]?.endsWith("check-implicit-any.mjs");
if (invokedAsScript) main();
