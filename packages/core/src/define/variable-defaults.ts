import { ConfigurationError } from "../errors/configuration-error";
import { cloneData } from "../utils/clone-data";
import { defineOwn } from "../utils/define-own";

/* Data a call's variables may hold: what JSON writes as it is. */
function isData(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isData);
  if (typeof value !== "object") return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const values: unknown[] = Object.values(value);
  return values.every(isData);
}

/**
 * Check the values `.defaults()` names: an object of the variables it fills
 * in, each one data a call could send — no `undefined`, which would default
 * nothing, and no function or class instance, which no request carries.
 *
 * @param values - What `.defaults()` was given
 * @param where - The endpoint, named in the error
 * @returns The values, as given
 * @throws ConfigurationError `DEFAULTS_INVALID`
 * @example
 * ```ts
 * variableDefaults({ groupBy: "year" }, 'GET "news"');
 * ```
 */
export function variableDefaults(
  values: unknown,
  where: string,
): Readonly<Record<string, unknown>> {
  const refuse = (problem: string): never => {
    throw new ConfigurationError(
      "DEFAULTS_INVALID",
      `[courier] .defaults() on ${where} ${problem}`,
    );
  };
  if (typeof values !== "object" || values === null || Array.isArray(values)) {
    return refuse("takes an object of the variables it fills in, such as { pageSize: 20 }");
  }
  const named: [string, unknown][] = Object.entries(values);
  for (const [name, value] of named) {
    if (!isData(value)) refuse(`names ${name}, whose value is no data a request can carry`);
  }
  return values as Readonly<Record<string, unknown>>;
}

/**
 * A call's variables with the endpoint's defaults filled in where the call
 * leaves a variable out, or sends it as `undefined`: the call's own value
 * wins. Variables that are no object — a form, a file — are left as they are.
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
  variables: unknown,
): unknown {
  if (defaults === undefined) return variables;
  if (variables === undefined || variables === null) return cloneData(defaults);
  if (typeof variables !== "object" || Array.isArray(variables)) return variables;
  const prototype: unknown = Object.getPrototypeOf(variables);
  if (prototype !== Object.prototype && prototype !== null) return variables;
  const merged: Record<string, unknown> = { ...variables };
  /* Read and defined as the call's own: a variable named `constructor` it left out takes its default. */
  for (const [name, value] of Object.entries(defaults)) {
    const given = Object.hasOwn(merged, name) ? merged[name] : undefined;
    if (given === undefined) defineOwn(merged, name, cloneData(value));
  }
  return merged;
}
