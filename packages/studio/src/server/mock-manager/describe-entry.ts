import { createLogger } from "@noverax/courier";
import type * as ManagedMocks from "@noverax/courier-mock/managed";
import type { MockServerDescription } from "@noverax/courier-mock/managed";
import { describeError } from "../describe-error";

/** A declared mock described, or the reason it could not be. */
export type DescribedEntry = { description: MockServerDescription } | { problem: string };

const log = createLogger("Mock");

let managed: Promise<typeof ManagedMocks> | undefined;

/**
 * Describe the mock declared under `key` in `courier.mocks.*` from the
 * definition Studio already loaded, with no process of its own. Whatever
 * keeps it from being described is returned as a problem to report on it.
 * Every page is shown the problem, and why a scenario could be read only in
 * part, a page without the project's token too: neither names a path as it
 * is on this machine — one in the project is named relative to it, any
 * other from `~` or `<temp>`. The terminal is told why a scenario was read
 * only in part as it was thrown.
 *
 * @param key - The mock's key in the mocks file.
 * @param definition - The value the mocks file declared there.
 * @param root - The project root, which paths in the project are named relative to.
 * @returns The description, or the problem to report.
 * @example
 * ```ts
 * const described = await describeEntry("apiMock", entries.apiMock, root);
 * if ("problem" in described) log.error(described.problem);
 * ```
 */
export async function describeEntry(
  key: string,
  definition: unknown,
  root?: string,
): Promise<DescribedEntry> {
  managed ??= import("@noverax/courier-mock/managed");
  let mock: typeof ManagedMocks;
  try {
    mock = await managed;
  } catch (err) {
    managed = undefined;
    return {
      problem: `Mock "${key}" needs @noverax/courier-mock, which could not be loaded: ${describeError(err, root)}`,
    };
  }
  if (!mock.isMockServerDefinition(definition)) {
    return { problem: `Mock "${key}" in courier.mocks is not a defineMockServer() definition.` };
  }
  let description: MockServerDescription;
  try {
    description = mock.describeMockServer(definition);
  } catch (err) {
    return { problem: `Mock "${key}" could not be described: ${describeError(err, root)}` };
  }
  for (const scenario of description.scenarios) {
    if (scenario.introspectionError === undefined) continue;
    log.warn(
      `Mock "${key}": scenario "${scenario.name}" was read only in part: ${scenario.introspectionError}`,
    );
  }
  return { description: withErrorsShown(description, root) };
}

function withErrorsShown(
  description: MockServerDescription,
  root: string | undefined,
): MockServerDescription {
  const scenarios = description.scenarios.map((scenario) =>
    scenario.introspectionError === undefined
      ? scenario
      : { ...scenario, introspectionError: describeError(scenario.introspectionError, root) },
  );
  return { ...description, scenarios };
}
