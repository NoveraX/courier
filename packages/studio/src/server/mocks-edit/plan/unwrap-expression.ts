import type {
  Expression,
  ParenthesizedExpression,
  TSAsExpression,
  TSNonNullExpression,
  TSSatisfiesExpression,
  TSTypeAssertion,
} from "oxc-parser";

type Wrapper =
  | TSSatisfiesExpression
  | TSAsExpression
  | ParenthesizedExpression
  | TSNonNullExpression
  | TSTypeAssertion;

/**
 * Look through what does not change a value at runtime: parentheses, `as`,
 * `satisfies`, `!` and `<T>` assertions.
 *
 * @param expression - Any expression
 * @returns The expression they wrap, or `expression` itself
 *
 * @example
 * ```ts
 * // ({ api } satisfies Mocks) → { api }
 * unwrapExpression(declaration);
 * ```
 */
export function unwrapExpression(expression: Expression): Expression {
  let current = expression;
  while (isWrapper(current)) current = current.expression;
  return current;
}

function isWrapper(expression: Expression): expression is Wrapper {
  switch (expression.type) {
    case "TSSatisfiesExpression":
    case "TSAsExpression":
    case "ParenthesizedExpression":
    case "TSNonNullExpression":
    case "TSTypeAssertion":
      return true;
    default:
      return false;
  }
}
