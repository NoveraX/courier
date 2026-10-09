import { safeStringify } from "@/lib/snippets";

/**
 * Variables written as the argument of a Courier call: an object literal,
 * its keys unquoted where JavaScript takes them so — or nothing at all for
 * a call without variables.
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
  return safeStringify(variables, 2).replace(/"([A-Za-z_$][\w$]*)":/g, "$1:");
}
