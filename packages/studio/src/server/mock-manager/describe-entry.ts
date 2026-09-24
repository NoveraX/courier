import { createLogger } from "@noverax/courier";
import type * as ManagedMocks from "@noverax/courier-mock/managed";
import type { MockServerDescription } from "@noverax/courier-mock/managed";

/** A declared mock described, or the reason it could not be. */
export type DescribedEntry = { description: MockServerDescription } | { problem: string };

const log = createLogger("Mock");

let managed: Promise<typeof ManagedMocks> | undefined;

/**
 * Describe the mock declared under `key` in `courier.mocks.*` from the
 * definition Studio already loaded, with no process of its own. Whatever
 * keeps it from being described is returned as a problem to report on it.
 *
 * @param key - The mock's key in the mocks file.
 * @param definition - The value the mocks file declared there.
 * @returns The description, or the problem to report.
 */
export async function describeEntry(key: string, definition: unknown): Promise<DescribedEntry> {
  managed ??= import("@noverax/courier-mock/managed");
  let mock: typeof ManagedMocks;
  try {
    mock = await managed;
  } catch (err) {
    managed = undefined;
    return {
      problem: `Mock "${key}" needs @noverax/courier-mock, which could not be loaded: ${reason(err)}`,
    };
  }
  if (!mock.isMockServerDefinition(definition)) {
    return { problem: `Mock "${key}" in courier.mocks is not a defineMockServer() definition.` };
  }
  let description: MockServerDescription;
  try {
    description = mock.describeMockServer(definition);
  } catch (err) {
    return { problem: `Mock "${key}" could not be described: ${reason(err)}` };
  }
  for (const scenario of description.scenarios) {
    if (scenario.introspectionError === undefined) continue;
    log.warn(
      `Mock "${key}": scenario "${scenario.name}" was read only in part: ${scenario.introspectionError}`,
    );
  }
  return { description };
}

function reason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
