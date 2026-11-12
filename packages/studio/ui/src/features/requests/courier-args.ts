import { codeValue } from "@/lib/snippet-values";

/**
 * Variables written as the argument of a Courier call: an object literal,
 * its keys unquoted where JavaScript takes them so — or nothing at all for
 * a call without variables. Each key is read as a whole, so a quote in one
 * never unquotes another's text.
 *
 * @param variables - The call's variables
 * @returns The argument, or an empty string
 * @example
 * ```ts
 * courierArgs({ id: "u_1" }); // '{\n  id: "u_1"\n}'
 * ```
 */
export function courierArgs(variables: unknown): string {
  if (variables === undefined || variables === null) return "";
  if (typeof variables === "object" && Object.keys(variables).length === 0) return "";
  return codeValue(variables, 2, true);
}
