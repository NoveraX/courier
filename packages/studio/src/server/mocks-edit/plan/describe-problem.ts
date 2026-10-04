import { lineNumberAt } from "./line-number-at";
import type { ParsedSource, ParseProblem } from "./parse-source";

/**
 * Describe a parse problem with the line it is on.
 *
 * @param parsed - A parsed source with a problem
 * @param problem - The problem
 * @returns The message, with its line when oxc gave one
 *
 * @example
 * ```ts
 * describeProblem(parsed, parsed.problem); // → "Expected `}` but found `EOF` (line 3)"
 * ```
 */
export function describeProblem(parsed: ParsedSource, problem: ParseProblem): string {
  if (problem.offset === null) return problem.message;
  return `${problem.message} (line ${lineNumberAt(parsed.text, problem.offset)})`;
}
