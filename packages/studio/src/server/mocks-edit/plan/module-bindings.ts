import type {
  BindingPattern,
  BindingRestElement,
  Declaration,
  Directive,
  Program,
  Statement,
  TSGlobalDeclaration,
  TSModuleDeclaration,
} from "oxc-parser";
import { hoistedVars } from "./hoisted-vars";

/** Where each name bound at a module's top level is declared, by name. */
export type ModuleBindings = ReadonlyMap<string, number>;

type Bind = (name: string, offset: number) => void;

/**
 * Collect every name a module binds at its top level: import locals,
 * variables (through destructuring patterns), functions, classes, enums,
 * namespaces, type aliases and interfaces — exported or not — and every
 * `var` declared outside functions and classes, however deeply it sits in
 * blocks, branches, loops, `try` or `switch`, since `var` belongs to the
 * module's scope wherever it is written. Type-only declarations count too,
 * since TypeScript rejects an import that shares a name with one.
 *
 * @param program - The parsed module
 * @returns The offset of each name's first declaration, by name
 *
 * @example
 * ```ts
 * collectModuleBindings(parse("const { a, b: [c] } = o; if (x) { var d; }").program); // → a, c, d
 * ```
 */
export function collectModuleBindings(program: Program): ModuleBindings {
  const bindings = new Map<string, number>();
  const bind: Bind = (name, offset) => {
    if (!bindings.has(name)) bindings.set(name, offset);
  };
  for (const statement of program.body) bindStatement(statement, bind);
  return bindings;
}

function bindStatement(statement: Directive | Statement, bind: Bind): void {
  switch (statement.type) {
    case "ImportDeclaration":
      for (const specifier of statement.specifiers) {
        bind(specifier.local.name, specifier.local.start);
      }
      return;
    case "ExportNamedDeclaration":
      if (statement.declaration !== null) bindDeclaration(statement.declaration, bind);
      return;
    case "ExportDefaultDeclaration": {
      const { declaration } = statement;
      const named =
        declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration";
      if (named && declaration.id !== null) bind(declaration.id.name, declaration.id.start);
      return;
    }
    default:
      bindDeclaration(statement, bind);
      for (const declaration of hoistedVars(statement)) bindDeclaration(declaration, bind);
  }
}

function bindDeclaration(node: Declaration | Directive | Statement, bind: Bind): void {
  switch (node.type) {
    case "VariableDeclaration":
      for (const declarator of node.declarations) bindPattern(declarator.id, bind);
      return;
    case "FunctionDeclaration":
    case "TSDeclareFunction":
    case "ClassDeclaration":
      if (node.id !== null) bind(node.id.name, node.id.start);
      return;
    case "TSEnumDeclaration":
    case "TSTypeAliasDeclaration":
    case "TSInterfaceDeclaration":
    case "TSImportEqualsDeclaration":
      bind(node.id.name, node.id.start);
      return;
    case "TSModuleDeclaration":
      bindNamespace(node, bind);
      return;
    default:
      return;
  }
}

/* `declare global` and `declare module "name"` bind nothing; `namespace A.B` binds `A`. */
function bindNamespace(node: TSModuleDeclaration | TSGlobalDeclaration, bind: Bind): void {
  if (node.kind === "global") return;
  let id = node.id;
  while (id.type === "TSQualifiedName") {
    if (id.left.type !== "Identifier" && id.left.type !== "TSQualifiedName") return;
    id = id.left;
  }
  if (id.type === "Identifier") bind(id.name, id.start);
}

function bindPattern(pattern: BindingPattern | BindingRestElement, bind: Bind): void {
  switch (pattern.type) {
    case "Identifier":
      bind(pattern.name, pattern.start);
      return;
    case "ObjectPattern":
      for (const property of pattern.properties) {
        bindPattern(property.type === "RestElement" ? property : property.value, bind);
      }
      return;
    case "ArrayPattern":
      for (const element of pattern.elements) if (element !== null) bindPattern(element, bind);
      return;
    case "AssignmentPattern":
      bindPattern(pattern.left, bind);
      return;
    case "RestElement":
      bindPattern(pattern.argument, bind);
      return;
  }
}
