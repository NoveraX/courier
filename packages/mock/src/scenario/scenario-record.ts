import { CourierError } from "@noverax/courier";

import type { AnyMockScenario } from "../types";

/** Why a mock server's scenarios were refused. */
export type ScenarioConfigErrorCode = "SCENARIOS_NOT_A_RECORD";

/**
 * Scenarios given as an array: a mock server takes them as an object keyed
 * by each scenario's name, which is how it names them to Studio and the
 * admin API. An array would name them "0", "1"….
 *
 * @example
 * ```js
 * defineMockServer({ scenarios: [defineScenario("empty", setup)] });
 * // → ScenarioConfigError: ... { "empty": defineScenario("empty", …) }
 * ```
 */
export class ScenarioConfigError extends CourierError<ScenarioConfigErrorCode> {
  /**
   * @param names - The scenarios' names, as the array gave them
   */
  constructor(names: readonly string[]) {
    const shape = names.map((name) => `"${name}": defineScenario("${name}", …)`).join(", ");
    super(
      `[courier-mock] scenarios is an object keyed by each scenario's name, not an array: { ${shape} }.`,
      { code: "SCENARIOS_NOT_A_RECORD", context: { names } },
    );
  }
}

function nameOf(scenario: unknown, at: number): string {
  if (typeof scenario === "object" && scenario !== null && "name" in scenario) {
    return typeof scenario.name === "string" ? scenario.name : String(at);
  }
  return String(at);
}

/**
 * A mock server's scenarios as the object it keeps them in — refusing an
 * array, which a caller without types can pass.
 *
 * @param scenarios - The scenarios the config gives
 * @returns A copy of them, keyed by name
 * @throws {ScenarioConfigError} When they come as an array
 * @example
 * ```ts
 * scenarioRecord({ empty: defineScenario("empty", setup) }); // { empty: … }
 * ```
 */
export function scenarioRecord(
  scenarios: Readonly<Record<string, AnyMockScenario>> | undefined,
): Record<string, AnyMockScenario> {
  const given: unknown = scenarios;
  if (Array.isArray(given)) throw new ScenarioConfigError(given.map(nameOf));
  return { ...scenarios };
}
