import type {
  Directive,
  ForStatementInit,
  ForStatementLeft,
  Statement,
  VariableDeclaration,
} from "oxc-parser";

type ForHead = ForStatementInit | ForStatementLeft;

/**
 * The `var` declarations a top-level statement holds anywhere below itself
 * — in blocks, branches, loops and their heads, `try`, `catch`, `finally`,
 * `switch` cases and labeled statements — but not inside a function or
 * class. `var` belongs to the module's scope wherever it is written there;
 * `let`, `const`, functions and classes in a block stay in the block.
 *
 * @param statement - A top-level statement of a module
 * @returns The `var` declarations nested in it, in source order
 *
 * @example
 * ```ts
 * // if (x) { var a = 1; } else { let b; }
 * hoistedVars(statement).length; // → 1
 * ```
 */
export function hoistedVars(statement: Directive | Statement): VariableDeclaration[] {
  const found: VariableDeclaration[] = [];
  for (const child of nestedIn(statement)) collect(child, found);
  return found;
}

function collect(node: Statement | ForHead, found: VariableDeclaration[]): void {
  if (node.type === "VariableDeclaration") {
    if (node.kind === "var") found.push(node);
    return;
  }
  for (const child of nestedIn(node)) collect(child, found);
}

/* What a statement runs as part of itself, in the scope `var` belongs to. */
function nestedIn(node: Directive | Statement | ForHead): Array<Statement | ForHead> {
  switch (node.type) {
    case "BlockStatement":
      return node.body;
    case "IfStatement":
      return [node.consequent, node.alternate].filter(present);
    case "TryStatement":
      return [node.block, node.handler?.body ?? null, node.finalizer].filter(present);
    case "ForStatement":
      return [node.init, node.body].filter(present);
    case "ForInStatement":
    case "ForOfStatement":
      return [node.left, node.body];
    case "WhileStatement":
    case "DoWhileStatement":
    case "LabeledStatement":
    case "WithStatement":
      return [node.body];
    case "SwitchStatement":
      return node.cases.flatMap((switchCase) => switchCase.consequent);
    default:
      return [];
  }
}

function present<TNode>(node: TNode | null): node is TNode {
  return node !== null;
}
