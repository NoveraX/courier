import { cloneData } from "./clone-data";
import { defineOwn } from "./define-own";
import { isPlainRecord } from "./is-plain-record";

/**
 * A call's variables with the endpoint's defaults filled in where the call
 * leaves a variable out, or sends it as `undefined`: the call's own value
 * wins. Variables that are no object — a form, a file — are left as they are.
 * Apart from `variableDefaults`, which checks the defaults where the
 * endpoint is defined: a page of definitions alone loads none of this.
 *
 * @param defaults - The endpoint's defaults, if it has any
 * @param variables - The call's variables
 * @returns The variables to send
 * @example
 * ```ts
 * withVariableDefaults({ groupBy: "year" }, { page: 2 }); // → { groupBy: "year", page: 2 }
 * ```
 */
export function withVariableDefaults(
  defaults: Readonly<Record<string, unknown>> | undefined,
  variables: Readonly<Record<string, unknown>>,
): Record<string, unknown>;
export function withVariableDefaults(
  defaults: Readonly<Record<string, unknown>> | undefined,
  variables: unknown,
): unknown;
export function withVariableDefaults(
  defaults: Readonly<Record<string, unknown>> | undefined,
  variables: unknown,
): unknown {
  if (defaults === undefined) return variables;
  if (variables === undefined || variables === null) return cloneData(defaults);
  if (!isPlainRecord(variables)) return variables;
  const merged: Record<string, unknown> = { ...variables };
  /* Read and defined as the call's own: a variable named `constructor` it left out takes its default. */
  for (const [name, value] of Object.entries(defaults)) {
    const given = Object.hasOwn(merged, name) ? merged[name] : undefined;
    if (given === undefined) defineOwn(merged, name, cloneData(value));
  }
  return merged;
}
