/**
 * Whether work threw for running out of stack, which work on a specification
 * does only for one nesting its schemas deeper than the work goes.
 *
 * @param error - What the work threw
 * @returns Whether it ran out of stack
 * @example
 * ```ts
 * if (ranOutOfStack(error)) return "The specification nests its schemas deeper than Studio can read.";
 * ```
 */
export function ranOutOfStack(error: unknown): boolean {
  return error instanceof RangeError && error.message.includes("Maximum call stack size exceeded");
}
